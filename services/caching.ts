import axios from 'axios';

import {generateRandom} from './shared-helpers';
import {IHeaders} from './shared-interfaces';
import {userAgent} from './user-agent';

// Set a max memory size of 128MB
const MAX_SIZE = 1024 * 1024 * 128;

interface IPromiseMap {
  promise: Promise<any>;
  ttl: number;
}

class PromiseCache {
  private mapper = new Map<string, IPromiseMap>();

  public getPromise(keyId: string, call: Promise<any>, ttl: number): Promise<any> {
    const now = new Date().valueOf();

    const mappedPromse = this.mapper.get(keyId);

    if (mappedPromse && mappedPromse.ttl > now) {
      return this.mapper.get(keyId).promise.catch(() => {
        // Remove promise from cache if it has failed
        this.removePromise(keyId);
      });
    }

    this.mapper.set(keyId, {
      promise: call,
      ttl: now + ttl,
    });

    return call;
  }

  public removePromise(keyId: string) {
    this.mapper.delete(keyId);
  }
}

export const promiseCache = new PromiseCache();

class CacheLayer {
  private keyMap = new Map<string, string>();
  private chunklistMap = new Map<string, string>();

  private fifo: string[] = [];
  private size = 0;

  public getChunklistFromUrl(url: string, prefix = ''): string {
    if (this.chunklistMap.has(url)) {
      return this.chunklistMap.get(url);
    }

    const randomId = generateRandom(8, prefix);

    this.chunklistMap.set(url, randomId);
    this.chunklistMap.set(randomId, url);

    return randomId;
  }

  public getChunklistFromId(id: string): string {
    if (this.chunklistMap.has(id)) {
      return this.chunklistMap.get(id);
    }

    throw new Error(`Could not find URL for: ${id}`);
  }

  public getSegmentFromUrl(url: string, prefix = ''): string {
    if (this.keyMap.has(url)) {
      return this.keyMap.get(url);
    }

    const randomId = generateRandom(8, prefix);

    this.keyMap.set(url, randomId);
    this.keyMap.set(randomId, url);

    return randomId;
  }

  public async getDataFromSegment(segment: string, headers: IHeaders): Promise<ArrayBuffer> {
    const url = this.keyMap.get(segment);

    if (!url) {
      throw new Error(`Could not find URL for: ${segment}`);
    }

    try {
      const {data} = await promiseCache.getPromise(
        segment,
        axios.get<ArrayBuffer>(url, {
          headers: {
            'User-Agent': userAgent,
            ...headers,
          },
          responseType: 'arraybuffer',
        }),
        1000 * 60 * 3,
      );

      const size = (data as any).length;

      while (this.size + size > MAX_SIZE) {
        const url = this.fifo.shift();
        const segmentId = this.keyMap.get(url);

        process.nextTick(() => {
          promiseCache.removePromise(segmentId);
          this.keyMap.delete(url);
          this.keyMap.delete(segmentId);
        });

        this.size -= size;
      }

      this.fifo.push(url);
      this.size += size;

      return data;
    } catch (e) {
      console.error(e);
      throw new Error(`Could not find URL for: ${segment}`);
    }
  }
}

export const cacheLayer = new CacheLayer();
