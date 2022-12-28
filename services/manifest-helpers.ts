import axios from 'axios';
import {Chunklist, Playlist, RenditionSortOrder} from 'dynamic-hls-proxy';
import _ from 'lodash';
import path from 'path';
import fs from 'fs';

import {generateRandom, flipObject} from './shared-helpers';
import {tmpPath} from './init-directories';
import {userAgent} from './user-agent';
import {IHeaders} from './shared-interfaces';

interface IKeyMap {
  [key: string]: string;
}

interface ISegmentData {
  uri: string;
  standalone?: boolean;
  timestamp: number;
  promise?: Promise<void>;
}

interface ISegmentMap {
  [key: string]: ISegmentData;
}

const isRelativeUrl = (url: string): boolean =>
  url.startsWith('http') ? false : true;
const cleanUrl = (url: string): string =>
  url.replace(/(\[.*\])/gm, '').replace(/(?<!:)\/\//gm, '/');
const createBaseUrl = (url: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  return cleaned.substring(0, cleaned.lastIndexOf('/') + 1);
};

const VALID_RESOLUTIONS = ['UHD/HDR', 'UHD/SDR', '1080p', '720p', '540p'];

const getMaxRes = _.memoize((): string =>
  _.includes(VALID_RESOLUTIONS, process.env.MAX_RESOLUTION)
    ? process.env.MAX_RESOLUTION
    : 'UHD/SDR',
);

const getResolutionRanges = _.memoize((): [number, number] => {
  const setProfile = getMaxRes();

  switch (setProfile) {
    case 'UHD/HDR':
    case 'UHD/SDR':
      return [0, 2160];
    case '1080p':
      return [0, 1080];
    case '720p':
      return [0, 720];
    default:
      return [0, 540];
  }
});

export class ChunklistHandler {
  private baseUrl: string;
  private baseManifestUrl: string;
  private headers: IHeaders;
  private channel: string;

  private segmentMap: ISegmentMap = {};
  private keyMap: IKeyMap = {};

  private interval: NodeJS.Timer;
  private mapInterval: NodeJS.Timer;

  constructor(
    manifestUrl: string,
    headers: IHeaders,
    appUrl: string,
    channel: string,
  ) {
    this.headers = headers;
    this.channel = channel;

    this.baseUrl = `${appUrl}/channels/${channel}/`;

    (async () => {
      const chunkListUrl = await this.getChunklist(manifestUrl, this.headers);

      const fullChunkUrl = cleanUrl(
        isRelativeUrl(chunkListUrl)
          ? `${createBaseUrl(manifestUrl)}/${chunkListUrl}`
          : chunkListUrl,
      );
      this.baseManifestUrl = cleanUrl(createBaseUrl(fullChunkUrl));

      this.proxyChunklist(fullChunkUrl);

      this.interval = setInterval(
        () => this.proxyChunklist(fullChunkUrl),
        1000,
      );
      this.mapInterval = setInterval(() => this.cleanMaps(), 30 * 1000);
    })();
  }

  public async getSegment(segmentId: string): Promise<void> {
    const filePath = path.join(tmpPath, `${this.channel}/${segmentId}.ts`);

    const segment = this.segmentMap[`${segmentId}.ts`];

    if (!segment) {
      console.log('Could not find mapped segment: ', segmentId);
      return;
    }

    const segmentName = segment.uri;
    const segmentUrl = segment.standalone
      ? segment.uri
      : `${this.baseManifestUrl}${segmentName}`;

    if (!fs.existsSync(filePath) && !segment.promise) {
      this.segmentMap[`${segmentId}.ts`].promise = this.getChunklistFile(
        segmentUrl,
        filePath,
      );
      await this.segmentMap[`${segmentId}.ts`].promise;
    }
  }

  public async getKey(keyId: string): Promise<void> {
    if (!this.keyMap[keyId]) {
      console.log('Could not find mapped key: ', keyId);
      return;
    }

    const filePath = path.join(tmpPath, `${this.channel}/${keyId}.key`);

    if (!fs.existsSync(filePath)) {
      await this.getChunklistFile(this.keyMap[keyId], filePath);
    }
  }

  public stop(): void {
    this.interval && clearInterval(this.interval);
    this.mapInterval && clearInterval(this.mapInterval);
  }

  private async getChunklistFile(url: string, filePath: string): Promise<void> {
    try {
      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          ...this.headers,
        },
        responseType: 'arraybuffer',
      });

      fs.writeFileSync(filePath, data);
    } catch (e) {
      console.error(e);
      console.log('Could not download file: ', url);
    }
  }

  private cleanMaps(): void {
    const now = new Date().valueOf();

    _.forOwn(this.segmentMap, (val, key) => {
      if (now - val.timestamp > 180 * 1000) {
        delete this.segmentMap[key];
      }
    });
  }

  private async getChunklist(
    manifestUrl: string,
    headers: IHeaders,
  ): Promise<string> {
    const [hMin, hMax] = getResolutionRanges();

    try {
      const {data: manifest} = await axios.get(manifestUrl, {
        headers: {
          'User-Agent': userAgent,
          ...headers,
        },
      });

      const playlist = Playlist.loadFromString(manifest);

      playlist.setResolutionRange(hMin, hMax);

      playlist
        .sortByBandwidth(
          getMaxRes() === '540p'
            ? RenditionSortOrder.nonHdFirst
            : RenditionSortOrder.bestFirst,
        )
        .setLimit(1);

      return playlist.getVideoRenditionUrl(0);
    } catch (e) {
      console.error(e);
      console.log('Could not parse M3U8 properly!');
    }
  }

  private async proxyChunklist(chunkListUrl: string): Promise<void> {
    try {
      const {data: chunkList} = await axios.get(chunkListUrl, {
        headers: {
          'User-Agent': userAgent,
          ...this.headers,
        },
      });

      let updatedChunkList = chunkList;
      const keys: string[] = [];
      const chunks = Chunklist.loadFromString(chunkList);

      chunks.segments.forEach(segment => {
        let segmentName = `${generateRandom(8, 'segment')}.ts`;

        if (segment.segment.uri.endsWith('.ts')) {
          segmentName = segment.segment.uri.substring(
            segment.segment.uri.lastIndexOf('/') + 1,
          );
        }

        const segmentData: ISegmentData = {
          timestamp: new Date().valueOf(),
          uri: segment.segment.uri,
        };

        if (segment.segment.uri.indexOf('://') !== -1) {
          segmentData.standalone = true;
        }

        this.segmentMap[segmentName] = segmentData;

        updatedChunkList = updatedChunkList.replace(
          segment.segment.uri,
          `${this.channel}/${segmentName}`,
        );

        if (segment.segment.key) {
          keys.push(segment.segment.key.uri);
        }
      });

      _.uniq(keys).forEach(key => {
        let keyName = `${generateRandom(8, 'key')}`;

        const flippedMap = flipObject(this.keyMap);

        if (!flippedMap[key]) {
          this.keyMap[keyName] = key;
        } else {
          keyName = flippedMap[key];
        }

        while (updatedChunkList.indexOf(key) > -1) {
          updatedChunkList = updatedChunkList.replace(
            key,
            `${this.baseUrl}${keyName}.key`,
          );
        }
      });

      fs.writeFileSync(
        path.join(tmpPath, `${this.channel}/${this.channel}.m3u8`),
        updatedChunkList,
      );
    } catch (e) {
      console.error(e);
      console.log('Could not parse chunklist properly!');
    }
  }
}
