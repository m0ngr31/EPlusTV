import axios from 'axios';
import {Chunklist, Playlist, RenditionSortOrder} from 'dynamic-hls-proxy';
import _ from 'lodash';

import {userAgent} from './user-agent';
import {IHeaders} from './shared-interfaces';
import {cacheLayer} from './cache-layer';
import {slateStream} from './stream-slate';

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

const reTarget = /#EXT-X-TARGETDURATION:([0-9]+)/;
const reSequence = /#EXT-X-MEDIA-SEQUENCE:([0-9]+)/;
const reVersion = /#EXT-X-VERSION:([0-9]+)/;

const getTargetDuration = (chunklist: string, divide = true): number => {
  let targetDuration = 2;

  const tester = reTarget.exec(chunklist);

  if (tester && tester[1]) {
    targetDuration = divide
      ? Math.floor(parseInt(tester[1], 10) / 2)
      : parseInt(tester[1], 10);

    if (!_.isNumber(targetDuration) || _.isNaN(targetDuration)) {
      targetDuration = 2;
    }
  }

  return targetDuration;
};

const getVersion = (chunklist: string): number => {
  let version = 3;

  const tester = reVersion.exec(chunklist);

  if (tester && tester[1]) {
    version = parseInt(tester[1], 10);

    if (!_.isNumber(version) || _.isNaN(version)) {
      version = 3;
    }
  }

  return version;
};

const getSequence = (chunklist: string): number => {
  let sequence = 0;

  const tester = reSequence.exec(chunklist);

  if (tester && tester[1]) {
    sequence = parseInt(tester[1], 10);

    if (!_.isNumber(sequence) || _.isNaN(sequence)) {
      sequence = 3;
    }
  }

  return sequence;
};

const sortedVal = (str: string): number => {
  if (str.startsWith('#EXTM3U')) {
    return 0;
  } else if (str.startsWith('#EXT-X-VERSION')) {
    return 1;
  } else if (str.startsWith('#EXT-X-TARGETDURATION')) {
    return 2;
  } else if (str.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
    return 3;
  }

  return 4;
};

/** We want the following order:
#EXTM3U
#EXT-X-VERSION
#EXT-X-TARGETDURATION
#EXT-X-MEDIA-SEQUENCE
*/
const sortChunklist = (a: string, b: string): number =>
  sortedVal(a) - sortedVal(b);

export const combineSlatePlaylist = (
  slate: string,
  playlist: string,
): string => {
  const splicedSlate = slate
    .split('\n')
    .splice(4)
    .filter(line => line && line !== '#EXT-X-DISCONTINUITY');
  // splicedSlate.splice(1, 0, '#EXT-X-DISCONTINUITY');
  let playlistArr: string[] = playlist.split('\n');

  const highestTargetDuration = Math.max(
    getTargetDuration(slate, false),
    getTargetDuration(playlist, false),
  );
  const highestVersion = Math.max(getVersion(slate), getVersion(playlist));
  const highestSequence =
    Math.max(getSequence(slate), getSequence(playlist)) + 1;

  playlistArr.sort(sortChunklist);

  playlistArr = playlistArr.map(line => {
    if (line.startsWith('#EXT-X-TARGETDURATION')) {
      line = `#EXT-X-TARGETDURATION:${highestTargetDuration}`;
    } else if (line.startsWith('#EXT-X-VERSION')) {
      line = `#EXT-X-VERSION:${highestVersion}`;
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
      line = `#EXT-X-MEDIA-SEQUENCE:${highestSequence}`;
    }

    return line;
  });

  const injectAt = _.findIndex(playlistArr, line =>
    line.startsWith('#EXT-X-MEDIA-SEQUENCE'),
  );

  if (injectAt < 0) {
    return playlist;
  }

  playlistArr.splice(injectAt, 0, ...splicedSlate, '#EXT-X-DISCONTINUITY');

  return playlistArr.join('\n');
};

export class ChunklistHandler {
  public m3u8: string;

  private appUrl: string;
  private baseUrl: string;
  private baseManifestUrl: string;
  private headers: IHeaders;
  private channel: string;

  private lastSequence: number;

  private interval: NodeJS.Timer;

  constructor(
    manifestUrl: string,
    headers: IHeaders,
    appUrl: string,
    channel: string,
  ) {
    this.headers = headers;
    this.channel = channel;

    this.appUrl = appUrl;
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
    })();
  }

  public async getSegmentOrKey(segmentId: string): Promise<ArrayBuffer> {
    try {
      return cacheLayer.getDataFromSegment(segmentId, this.headers);
    } catch (e) {
      console.error(e);
    }
  }

  public stop(): void {
    this.interval && clearInterval(this.interval);
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
      const keys = new Set<string>();
      const chunks = Chunklist.loadFromString(chunkList);

      chunks.segments.forEach(segment => {
        const fullSegmentUrl = isRelativeUrl(segment.segment.uri)
          ? `${this.baseManifestUrl}${segment.segment.uri}`
          : segment.segment.uri;
        const segmentName = cacheLayer.getSegmentFromUrl(
          fullSegmentUrl,
          `${this.channel}-segment`,
        );

        updatedChunkList = updatedChunkList.replace(
          segment.segment.uri,
          `${this.channel}/${segmentName}.ts`,
        );

        if (segment.segment.key) {
          keys.add(segment.segment.key.uri);
        }
      });

      keys.forEach(key => {
        const keyName = cacheLayer.getSegmentFromUrl(
          key,
          `${this.channel}-key`,
        );

        while (updatedChunkList.indexOf(key) > -1) {
          updatedChunkList = updatedChunkList.replace(
            key,
            `${this.baseUrl}${keyName}.key`,
          );
        }
      });

      if (!this.interval) {
        // Setup interval to refresh chunklist
        this.interval = setInterval(
          () => this.proxyChunklist(chunkListUrl),
          getTargetDuration(chunkList) * 1000,
        );

        // Merge playlist with slate
        const slate = slateStream.getSlate('soon', this.appUrl);

        updatedChunkList = combineSlatePlaylist(slate, updatedChunkList);
        this.lastSequence =
          Math.max(getSequence(slate), getSequence(updatedChunkList)) + 1;
      } else {
        this.lastSequence += 1;
      }

      process.nextTick(() => (this.m3u8 = updatedChunkList));
    } catch (e) {
      console.error(e);
      console.log('Could not parse chunklist properly!');
    }
  }
}
