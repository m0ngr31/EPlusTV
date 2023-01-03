import axios from 'axios';

import {generateRandom} from './shared-helpers';
import {IHeaders} from './shared-interfaces';
import {userAgent} from './user-agent';

// Set a max memory size of 128MB
const MAX_SIZE = 1024 * 1024 * 128;

class CacheLayer {
  private keyMap = new Map<string, string>();
  private dataMap = new Map<string, ArrayBuffer>();

  private fifo: string[] = [];
  private size = 0;

  public getSegmentFromUrl(url: string, prefix = ''): string {
    if (this.keyMap.has(url)) {
      return this.keyMap.get(url);
    }

    const randomId = generateRandom(8, prefix);

    this.keyMap.set(url, randomId);
    this.keyMap.set(randomId, url);

    return randomId;
  }

  public async getDataFromSegment(
    segment: string,
    headers: IHeaders,
  ): Promise<ArrayBuffer> {
    const url = this.keyMap.get(segment);

    if (!url) {
      throw new Error(`Could not find URL for: ${segment}`);
    }

    const exisingData = this.dataMap.get(url);

    if (!exisingData) {
      try {
        const {data} = await axios.get<ArrayBuffer>(url, {
          headers: {
            'User-Agent': userAgent,
            ...headers,
          },
          responseType: 'arraybuffer',
        });

        const size = (data as any).length;

        while (this.size + size > MAX_SIZE) {
          const url = this.fifo.shift();
          const segmentId = this.keyMap.get(url);

          process.nextTick(() => {
            this.dataMap.delete(url);
            this.keyMap.delete(url);
            this.keyMap.delete(segmentId);
          });

          this.size -= size;
        }

        this.fifo.push(url);
        this.dataMap.set(url, data);
        this.size += size;

        return data;
      } catch (e) {
        console.error(e);
        throw new Error(`Could not find URL for: ${segment}`);
      }
    }

    return exisingData;
  }
}

export const cacheLayer = new CacheLayer();
