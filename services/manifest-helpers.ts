import {Chunklist, Playlist, RenditionSortOrder} from 'dynamic-hls-proxy';
import axios from 'axios';
import _ from 'lodash';

import {userAgent} from './user-agent';
import {IHeaders} from './shared-interfaces';
import {cacheLayer, promiseCache} from './caching';
import {appStatus} from './app-status';

const isRelativeUrl = (url?: string): boolean => (url?.startsWith('http') ? false : true);
const cleanUrl = (url: string): string => url.replace(/(\[.*\])/gm, '').replace(/(?<!:)\/\//gm, '/');
const createBaseUrl = (url: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  return cleaned.substring(0, cleaned.lastIndexOf('/') + 1);
};

const VALID_RESOLUTIONS = ['UHD/HDR', 'UHD/SDR', '1080p', '720p', '540p'];

const getMaxRes = _.memoize((): string =>
  _.includes(VALID_RESOLUTIONS, process.env.MAX_RESOLUTION) ? process.env.MAX_RESOLUTION : 'UHD/SDR',
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

const reTarget = /#EXT-X-TARGETDURATION:([0-9]+)/;
const reAudioTrack = /#EXT-X-MEDIA:TYPE=AUDIO.*URI="(.*)"$/gm;

const getTargetDuration = (chunklist: string, divide = true): number => {
  let targetDuration = 2;

  const tester = reTarget.exec(chunklist);

  if (tester && tester[1]) {
    targetDuration = divide ? Math.floor(parseInt(tester[1], 10) / 2) : parseInt(tester[1], 10);

    if (!_.isNumber(targetDuration) || _.isNaN(targetDuration)) {
      targetDuration = 2;
    }
  }

  return targetDuration;
};

export class ChunklistHandler {
  public playlist: string;

  private baseUrl: string;
  private baseProxyUrl: string;
  private headers: IHeaders;
  private channel: string;
  private segmentDuration: number;

  constructor(headers: IHeaders, appUrl: string, channel: string) {
    this.headers = headers;
    this.channel = channel;
    this.baseUrl = `${appUrl}/channels/${channel}/`;
    this.baseProxyUrl = `${appUrl}/chunklist/${channel}/`;
  }

  public async init(manifestUrl: string): Promise<void> {
    await this.parseManifest(manifestUrl, this.headers);
  }

  public async getSegmentOrKey(segmentId: string): Promise<ArrayBuffer> {
    try {
      appStatus.channels[this.channel].heartbeat = new Date().valueOf();
      return cacheLayer.getDataFromSegment(segmentId, this.headers);
    } catch (e) {
      console.error(e);
    }
  }

  public async parseManifest(manifestUrl: string, headers: IHeaders): Promise<void> {
    const [hMin, hMax] = getResolutionRanges();

    try {
      const {data: manifest} = await axios.get<string>(manifestUrl, {
        headers: {
          'User-Agent': userAgent,
          ...headers,
        },
      });

      let updatedManifest = manifest;

      const playlist = Playlist.loadFromString(manifest);
      const renditions = playlist.getRenditions();

      playlist.setResolutionRange(hMin, hMax);

      playlist
        .sortByBandwidth(getMaxRes() === '540p' ? RenditionSortOrder.nonHdFirst : RenditionSortOrder.bestFirst)
        .setLimit(1);

      let chunklist: string;

      try {
        chunklist = decodeURIComponent(playlist.getVideoRenditionUrl(0));
      } catch (e) {
        chunklist = decodeURIComponent(playlist.getRenditions().audioRenditions[0].uri);
      }

      /** For FOX 4K streams */
      const audioTracks = [...manifest.matchAll(reAudioTrack)];

      audioTracks.forEach(track => {
        if (track && track[1]) {
          const fullChunklistUrl = cleanUrl(
            isRelativeUrl(track[1]) ? `${createBaseUrl(manifestUrl)}/${track[1]}` : track[1],
          );

          const chunklistName = cacheLayer.getChunklistFromUrl(fullChunklistUrl);
          updatedManifest = updatedManifest.replace(track[1], `${this.baseProxyUrl}${chunklistName}.m3u8`);
        }
      });

      /**
       * For some reason this library picks up 4K FOX Sports streams as
       * Audio renditions instead of video. So we have to check these too
       */
      renditions.audioRenditions.forEach(rendition => {
        if (decodeURIComponent(rendition.uri) !== chunklist) {
          updatedManifest = updatedManifest.replace(decodeURI(rendition.uri), '');
        } else {
          const fullChunklistUrl = cleanUrl(
            isRelativeUrl(rendition.uri) ? `${createBaseUrl(manifestUrl)}/${rendition.uri}` : rendition.uri,
          );

          const chunklistName = cacheLayer.getChunklistFromUrl(fullChunklistUrl);
          updatedManifest = updatedManifest.replace(rendition.uri, `${this.baseProxyUrl}${chunklistName}.m3u8`);
        }
      });

      renditions.videoRenditions.forEach(rendition => {
        if (decodeURIComponent(rendition.uri) !== chunklist) {
          updatedManifest = updatedManifest.replace(decodeURI(rendition.uri), '');
        } else {
          const fullChunklistUrl = cleanUrl(
            isRelativeUrl(rendition.uri) ? `${createBaseUrl(manifestUrl)}/${rendition.uri}` : rendition.uri,
          );

          const chunklistName = cacheLayer.getChunklistFromUrl(fullChunklistUrl);
          updatedManifest = updatedManifest.replace(rendition.uri, `${this.baseProxyUrl}${chunklistName}.m3u8`);
        }
      });

      // Cleanup m3u8
      updatedManifest = updatedManifest
        .replace(/#UPLYNK-MEDIA.*$/gm, '')
        .replace(/#EXT-X-I-FRAME-STREAM-INF.*$/gm, '')
        .replace(/#EXT-X-IMAGE-STREAM-INF.*$/gm, '')
        .replace(/#EXT-X-STREAM-INF.*$\n\n/gm, '')
        .replace(/\n\n/gm, '\n');

      this.playlist = updatedManifest;
    } catch (e) {
      console.error(e);
      console.log('Could not parse M3U8 properly!');
    }
  }

  public cacheChunklist(chunklistId: string): Promise<string> {
    if (this.segmentDuration) {
      return promiseCache.getPromise(chunklistId, this.proxyChunklist(chunklistId), this.segmentDuration * 1000);
    }

    return this.proxyChunklist(chunklistId);
  }

  private async proxyChunklist(chunkListId: string): Promise<string> {
    try {
      const url = cacheLayer.getChunklistFromId(chunkListId);
      const baseManifestUrl = cleanUrl(createBaseUrl(url));

      const {data: chunkList} = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          ...this.headers,
        },
      });

      if (!this.segmentDuration) {
        this.segmentDuration = getTargetDuration(chunkList);
      }

      let updatedChunkList = chunkList;
      const keys = new Set<string>();
      const chunks = Chunklist.loadFromString(chunkList);

      chunks.segments.forEach(segment => {
        const fullSegmentUrl = isRelativeUrl(segment.segment.uri)
          ? `${baseManifestUrl}${segment.segment.uri}`
          : segment.segment.uri;

        if (segment.segment.key?.uri) {
          const segmentName = cacheLayer.getSegmentFromUrl(fullSegmentUrl, `${this.channel}-segment`);

          updatedChunkList = updatedChunkList.replace(segment.segment.uri, `${this.baseUrl}${segmentName}.ts`);

          keys.add(segment.segment.key.uri);
        } else {
          // Don't proxy segments that don't have keys
          updatedChunkList = updatedChunkList.replace(segment.segment.uri, `${fullSegmentUrl}`);
        }
      });

      keys.forEach(key => {
        const keyName = cacheLayer.getSegmentFromUrl(key, `${this.channel}-key`);

        while (updatedChunkList.indexOf(key) > -1) {
          updatedChunkList = updatedChunkList.replace(key, `${this.baseUrl}${keyName}.key`);
        }
      });

      return updatedChunkList;
    } catch (e) {
      console.error(e);
      console.log('Could not parse chunklist properly!');
    }
  }
}
