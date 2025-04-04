import {Manifest, Parser} from 'm3u8-parser';

import axios from 'axios';
import _ from 'lodash';

import {userAgent} from './user-agent';
import {IHeaders, THeaderInfo} from './shared-interfaces';
import {cacheLayer, promiseCache} from './caching';
import {proxySegments} from './misc-db-service';

const isRelativeUrl = (url?: string): boolean => (url?.startsWith('http') ? false : true);
const cleanUrl = (url: string): string => url.replace(/(\[.*\])/gm, '').replace(/(?<!:)\/\//gm, '/');
const createBaseUrl = (url: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  return cleaned.substring(0, cleaned.lastIndexOf('/') + 1);
};
const createBaseUrlChunklist = (url: string, network: string): string => {
  const cleaned = url.replace(/\.m3u8.*$/, '');
  let filteredUrl: string[] | string = cleaned.split('/');

  if (network === 'foxsports' && !url.includes('akamai')) {
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

const reTarget = /#EXT-X-TARGETDURATION:([0-9]+)/;
const reAudioTrack = /#EXT-X-MEDIA:TYPE=AUDIO.*URI="([^"]+)"/gm;
const reAudioTrackNesn = /#EXT-X-MEDIA.*TYPE=AUDIO.*URI="([^"]+)"/gm;
const reMap = /#EXT-X-MAP:URI="([^"]+)"/gm;
const reSubMap = /#EXT-X-MEDIA:TYPE=SUBTITLES.*URI="([^"]+)"/gm;
const reSubMapVictory = /#EXT-X-MEDIA:.*TYPE=SUBTITLES.*URI="([^"]+)"/gm;
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

function stringifyManifest(manifest: any, postProcess?: (manifest: string) => string): string {
  const lines: string[] = [];
  // Always start with the mandatory EXTM3U header
  lines.push('#EXTM3U');

  // If version exists, add the EXT-X-VERSION tag
  if (manifest.version) {
    lines.push(`#EXT-X-VERSION:${manifest.version}`);
  }

  // If independent segments are present, add the corresponding tag
  if (manifest.independentSegments) {
    lines.push('#EXT-X-INDEPENDENT-SEGMENTS');
  }

  // Check if the manifest is a master playlist or a media playlist
  if (manifest.playlists && manifest.playlists.length > 0) {
    // Process master playlist
    manifest.playlists.forEach((variant: any) => {
      // Build the attribute string for the EXT-X-STREAM-INF tag
      const attributes: string[] = [];
      if (variant.attributes && variant.attributes.BANDWIDTH) {
        attributes.push(`BANDWIDTH=${variant.attributes.BANDWIDTH}`);
      }
      if (variant.attributes && variant.attributes.RESOLUTION) {
        const res = variant.attributes.RESOLUTION;
        attributes.push(`RESOLUTION=${res.width}x${res.height}`);
      }
      if (variant.attributes && variant.attributes.CODECS) {
        attributes.push(`CODECS="${variant.attributes.CODECS}"`);
      }
      // Add other attributes if necessary...

      lines.push(`#EXT-X-STREAM-INF:${attributes.join(',')}`);
      // The next line is the URI of the variant
      lines.push(variant.uri);
    });
  } else if (manifest.segments && manifest.segments.length > 0) {
    // Process media playlist

    // If a start tag is present, add the EXT-X-START tag
    if (manifest.start && manifest.start.timeOffset !== undefined) {
      const precise = manifest.start.precise ? ',PRECISE=YES' : '';
      lines.push(`#EXT-X-START:TIME-OFFSET=${manifest.start.timeOffset}${precise}`);
    }
    // If target duration exists, add the EXT-X-TARGETDURATION tag
    if (manifest.targetDuration) {
      lines.push(`#EXT-X-TARGETDURATION:${manifest.targetDuration}`);
    }
    // If media sequence is defined, add the EXT-X-MEDIA-SEQUENCE tag
    if (manifest.mediaSequence !== undefined) {
      lines.push(`#EXT-X-MEDIA-SEQUENCE:${manifest.mediaSequence}`);
    }

    // Iterate over each segment in the media playlist
    manifest.segments.forEach((segment: any) => {
      // Add the EXTINF tag with duration and title (if available)
      if (segment.duration !== undefined) {
        const title = segment.title ? segment.title : '';
        lines.push(`#EXTINF:${segment.duration},${title}`);
      }
      // Add the URI of the segment
      lines.push(segment.uri);
      // If there is a discontinuity, add the discontinuity tag
      if (segment.discontinuity) {
        lines.push('#EXT-X-DISCONTINUITY');
      }
    });
    // If the playlist is marked as ended, add the EXT-X-ENDLIST tag
    if (manifest.endList) {
      lines.push('#EXT-X-ENDLIST');
    }
  } else {
    console.warn('Manifest does not contain playlists or segments.');
  }

  // Combine all lines into a single string
  let result = lines.join('\n');

  // Apply post-processing if a postProcess function is provided
  if (postProcess && typeof postProcess === 'function') {
    result = postProcess(result);
  }

  return result;
}

export class PlaylistHandler {
  public playlist: string;

  private baseUrl: string;
  private baseProxyUrl: string;
  private headers: THeaderInfo;
  private overlayCookies?: string[];
  private currentHeaders?: IHeaders;
  private channel: string;
  private segmentDuration: number;
  private network: string;
  private eventId: string | number;

  constructor(headers: THeaderInfo, appUrl: string, channel: string, network: string, eventId: string | number) {
    this.headers = headers;
    this.channel = channel;
    this.baseUrl = `${appUrl}/channels/${channel}/`;
    this.baseProxyUrl = `${appUrl}/chunklist/${channel}/`;
    this.network = network;
    this.eventId = eventId;
  }

  public async initialize(manifestUrl: string): Promise<void> {
    const headers = await this.getHeaders();
    await this.parseManifest(manifestUrl, headers);
  }

  public async getSegmentOrKey(segmentId: string): Promise<ArrayBuffer> {
    try {
      const headers = await this.getHeaders();
      return cacheLayer.getDataFromSegment(segmentId, headers);
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
          'Accept-Encoding': 'identity',
          'User-Agent': userAgent,
          ...headers,
        },
      });

      if (resHeaders['set-cookie']) {
        this.overlayCookies = resHeaders['set-cookie'];
      }

      const realManifestUrl = request.res.responseUrl;
      const urlParams = this.network === 'foxsports' ? new URL(realManifestUrl).search : '';

      /** Parse the manifest */
      const parser = new Parser();
      parser.push(manifest);
      parser.end();
      const playlist: Manifest = parser.manifest;

      /** Sort playlist so highest resolution is first in list (Emby workaround) */
      playlist.playlists?.sort((v1, v2) => {
        if (v1.attributes.BANDWIDTH > v2.attributes.BANDWIDTH) {
          return -1;
        }
        if (v1.attributes.BANDWIDTH < v2.attributes.BANDWIDTH) {
          return 1;
        }
        return 0;
      });

      const stringifiedManifest = stringifyManifest(playlist);
      const clonedManifest = updateVersion(stringifiedManifest);
      let updatedManifest = clonedManifest;

      if (this.network === 'nesn') {
        const audioTracks = [...manifest.matchAll(reAudioTrackNesn)];
        audioTracks.forEach(track => {
          if (track && track[1]) {
            const fullChunklistUrl = parseReplacementUrl(track[1], realManifestUrl);

            const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
            updatedManifest = updatedManifest.replace(track[1], `${this.baseProxyUrl}${chunklistName}.m3u8`);
          }
        });
      } else if (this.network === 'victory' || this.network === 'bally') {
        const subTracks = [...manifest.matchAll(reSubMapVictory)];
        subTracks.forEach(track => {
          if (track && track[1]) {
            const fullChunklistUrl = parseReplacementUrl(track[1], realManifestUrl);

            const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
            updatedManifest = updatedManifest.replace(track[1], `${this.baseProxyUrl}${chunklistName}.m3u8`);
          }
        });
      } else if (this.network !== 'foxsports') {
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

      playlist.playlists?.forEach((variant: any) => {
        const fullChunklistUrl = parseReplacementUrl(variant.uri, realManifestUrl);
        const chunklistName = cacheLayer.getChunklistFromUrl(`${fullChunklistUrl}${urlParams}`);
        updatedManifest = updatedManifest.replace(variant.uri, `${this.baseProxyUrl}${chunklistName}.m3u8`);
      });

      this.playlist = updatedManifest;
    } catch (e) {
      // console.error(e);
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
    const proxyAllSegments = await proxySegments();

    try {
      const url = cacheLayer.getChunklistFromId(chunkListId);
      const headers = await this.getHeaders();

      const {data: chunkList, request} = await axios.get<string>(url, {
        headers: {
          'Accept-Encoding': 'identity',
          'User-Agent': userAgent,
          ...headers,
        },
      });

      const realChunklistUrl = request.res.responseUrl;
      const baseManifestUrl = cleanUrl(createBaseUrlChunklist(realChunklistUrl, this.network));
      const keys = new Set<string>();

      const clonedChunklist = updateVersion(chunkList);
      let updatedChunkList = clonedChunklist;

      /** Parse the manifest */
      const parser = new Parser();
      parser.push(clonedChunklist);
      parser.end();
      const chunks: Manifest = parser.manifest;

      const shouldProxy =
        proxyAllSegments || baseManifestUrl.includes('akamai') || this.network === 'mlbtv' || this.network === 'gotham';

      chunks.segments.forEach(segment => {
        const segmentUrl = segment.uri;
        const segmentKey = segment.key?.uri;

        const fullSegmentUrl = isRelativeUrl(segmentUrl)
          ? usesHostRoot(segmentUrl)
            ? convertHostUrl(segmentUrl, baseManifestUrl)
            : cleanUrl(`${baseManifestUrl}${segmentUrl}`)
          : segmentUrl;

        if (
          shouldProxy &&
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

          if (shouldProxy) {
            const m4iName = cacheLayer.getSegmentFromUrl(fullMapUrl, `${this.channel}-m4i`);
            updatedChunkList = updatedChunkList.replace(xmap[1], `${this.baseUrl}${m4iName}.m4i`);
          } else {
            updatedChunkList = updatedChunkList.replace(xmap[1], fullMapUrl);
          }
        }
      });

      return updatedChunkList;
    } catch (e) {
      console.error(e);
      console.log('Could not parse chunklist properly!');
    }
  }

  private async getHeaders(): Promise<IHeaders> {
    let headers: IHeaders = {};

    if (_.isFunction(this.headers)) {
      headers = await this.headers(this.eventId, this.currentHeaders);
    } else {
      headers = _.cloneDeep(this.headers);
    }

    this.currentHeaders = _.cloneDeep(headers);

    if (this.overlayCookies) {
      if (headers.Cookie) {
        headers.Cookie = [
          ...new Set([...(_.isArray(headers.Cookie) ? headers.Cookie : [`${headers.Cookie}`]), ...this.overlayCookies]),
        ];
      } else {
        headers.Cookie = this.overlayCookies;
      }
    }

    return headers;
  }
}
