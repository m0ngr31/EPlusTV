import HLS from 'hls-parser';
import axios from 'axios';
import _ from 'lodash';

import {userAgent} from './user-agent';
import {IHeaders} from './shared-interfaces';
import {cacheLayer, promiseCache} from './caching';

const isRelativeUrl = (url?: string): boolean => (url?.startsWith('http') ? false : true);
const cleanUrl = (url: string): string => url.replace(/(\[.*\])/gm, '').replace(/(?<!:)\/\//gm, '/');
const createBaseUrl = (url: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  return cleaned.substring(0, cleaned.lastIndexOf('/') + 1);
};
const createBaseUrlChunklist = (url: string, network: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  let filteredUrl: string[] | string = cleaned.split('/');

  if (network === 'foxsports') {
    filteredUrl = filteredUrl.filter(seg => !seg.match(/=/));
  }

  filteredUrl = filteredUrl.join('/');
  return filteredUrl.substring(0, filteredUrl.lastIndexOf('/') + 1);
};
const usesHostRoot = (url: string): boolean => url.startsWith('/');
const convertHostUrl = (url: string, fullUrl: string): string => {
  const uri = new URL(fullUrl);

  return `${uri.origin}${url}`;
};
const isBase64Uri = (url: string) => url.indexOf('base64') > -1 || url.startsWith('data');

const PROXY_SEGMENTS =
  process.env.PROXY_SEGMENTS && process.env.PROXY_SEGMENTS.toLowerCase() !== 'false' ? true : false;

const reTarget = /#EXT-X-TARGETDURATION:([0-9]+)/;
const reAudioTrack = /#EXT-X-MEDIA:TYPE=AUDIO.*URI="([^"]+)"/gm;
const reMap = /#EXT-X-MAP:URI="([^"]+)"/gm;
const reSubMap = /#EXT-X-MEDIA:TYPE=SUBTITLES.*URI="([^"]+)"/gm;
const reVersion = /#EXT-X-VERSION:(\d+)/;

const updateVersion = (playlist: string): string =>
  playlist.replace(reVersion, (match, currentVersion) => {
    const numericValue = +currentVersion;
    const newVersion = numericValue < 5 ? 5 : numericValue;
    return `#EXT-X-VERSION:${newVersion}`;
  });

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

const parseReplacementUrl = (url: string, manifestUrl: string): string =>
  isRelativeUrl(url)
    ? usesHostRoot(url)
      ? convertHostUrl(url, manifestUrl)
      : cleanUrl(`${createBaseUrl(manifestUrl)}/${url}`)
    : url;

export class PlaylistHandler {
  public playlist: string;

  private baseUrl: string;
  private baseProxyUrl: string;
  private headers: IHeaders;
  private channel: string;
  private segmentDuration: number;
  private network: string;

  constructor(headers: IHeaders, appUrl: string, channel: string, network: string) {
    this.headers = headers;
    this.channel = channel;
    this.baseUrl = `${appUrl}/channels/${channel}/`;
    this.baseProxyUrl = `${appUrl}/chunklist/${channel}/`;
    this.network = network;
  }

  public async initialize(manifestUrl: string): Promise<void> {
    await this.parseManifest(manifestUrl, this.headers);
  }

  public async getSegmentOrKey(segmentId: string): Promise<ArrayBuffer> {
    try {
      return cacheLayer.getDataFromSegment(segmentId, this.headers);
    } catch (e) {
      console.error(e);
    }
  }

  public async parseManifest(manifestUrl: string, headers: IHeaders): Promise<void> {
    try {
      const {
        data: manifest,
        request,
        headers: resHeaders,
      } = await axios.get<string>(manifestUrl, {
        headers: {
          'User-Agent': userAgent,
          ...headers,
        },
      });

      if (resHeaders['set-cookie']) {
        if (this.headers.Cookie) {
          if (_.isArray(this.headers.Cookie)) {
            this.headers.Cookie = [...this.headers.Cookie, ...resHeaders['set-cookie']];
          } else {
            this.headers.Cookie = [`${this.headers.Cookie}`, ...resHeaders['set-cookie']];
          }
        } else {
          this.headers.Cookie = resHeaders['set-cookie'];
        }
      }

      const realManifestUrl = request.res.responseUrl;
      const urlParams = this.network === 'foxsports' ? new URL(realManifestUrl).search : '';

      const clonedManifest = updateVersion(manifest);
      let updatedManifest = clonedManifest;

      const playlist = HLS.parse(clonedManifest);

      if (this.network !== 'foxsports') {
        const audioTracks = [...manifest.matchAll(reAudioTrack)];
        audioTracks.forEach(track => {
          if (track && track[1]) {
            const fullChunklistUrl = parseReplacementUrl(track[1], realManifestUrl);

            const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
            updatedManifest = updatedManifest.replace(track[1], `${this.baseProxyUrl}${chunklistName}.m3u8`);
          }
        });

        const subTracks = [...manifest.matchAll(reSubMap)];
        subTracks.forEach(track => {
          if (track && track[1]) {
            const fullChunklistUrl = parseReplacementUrl(track[1], realManifestUrl);

            const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
            updatedManifest = updatedManifest.replace(track[1], `${this.baseProxyUrl}${chunklistName}.m3u8`);
          }
        });
      }

      playlist.variants.forEach(variant => {
        const fullChunklistUrl = parseReplacementUrl(variant.uri, realManifestUrl);

        const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
        updatedManifest = updatedManifest.replace(variant.uri, `${this.baseProxyUrl}${chunklistName}.m3u8`);
      });

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

      const {data: chunkList, request} = await axios.get<string>(url, {
        headers: {
          'User-Agent': userAgent,
          ...this.headers,
        },
      });

      const realChunklistUrl = request.res.responseUrl;
      const baseManifestUrl = cleanUrl(createBaseUrlChunklist(realChunklistUrl, this.network));
      const keys = new Set<string>();

      const clonedChunklist = updateVersion(chunkList);
      let updatedChunkList = clonedChunklist;

      const chunks = HLS.parse(clonedChunklist);

      chunks.segments.forEach(segment => {
        const segmentUrl = segment.uri;
        const segmentKey = segment.key?.uri;

        const fullSegmentUrl = isRelativeUrl(segmentUrl)
          ? usesHostRoot(segmentUrl)
            ? convertHostUrl(segmentUrl, baseManifestUrl)
            : cleanUrl(`${baseManifestUrl}${segmentUrl}`)
          : segmentUrl;

        if (
          PROXY_SEGMENTS &&
          // Proxy keyed segments
          (segmentKey ||
            // Proxy non-keyed segments that aren't on ESPN
            (!segmentKey && this.network !== 'espn')) &&
          // Just until I figure out a workaround
          !segmentUrl.endsWith('mp4')
        ) {
          const segmentName = cacheLayer.getSegmentFromUrl(fullSegmentUrl, `${this.channel}-segment`);
          updatedChunkList = updatedChunkList.replace(segmentUrl, `${this.baseUrl}${segmentName}.ts`);
        } else {
          updatedChunkList = updatedChunkList.replace(segmentUrl, fullSegmentUrl);
        }

        if (segmentKey && !isBase64Uri(segmentKey)) {
          keys.add(segmentKey);
        }
      });

      if (!this.segmentDuration) {
        this.segmentDuration = getTargetDuration(chunkList);
      }

      keys.forEach(key => {
        const fullKeyUrl = isRelativeUrl(key)
          ? usesHostRoot(key)
            ? convertHostUrl(key, baseManifestUrl)
            : cleanUrl(`${baseManifestUrl}${key}`)
          : key;

        const keyName = cacheLayer.getSegmentFromUrl(fullKeyUrl, `${this.channel}-key`);

        while (updatedChunkList.indexOf(key) > -1) {
          updatedChunkList = updatedChunkList.replace(key, `${this.baseUrl}${keyName}.key`);
        }
      });

      const xMaps = [...updatedChunkList.matchAll(reMap)];

      xMaps.forEach(xmap => {
        if (xmap && xmap[1]) {
          const fullMapUrl = isRelativeUrl(xmap[1])
            ? usesHostRoot(xmap[1])
              ? convertHostUrl(xmap[1], baseManifestUrl)
              : cleanUrl(`${baseManifestUrl}${xmap[1]}`)
            : xmap[1];

          updatedChunkList = updatedChunkList.replace(xmap[1], fullMapUrl);
        }
      });

      return updatedChunkList;
    } catch (e) {
      console.error(e);
      console.log('Could not parse chunklist properly!');
    }
  }
}
