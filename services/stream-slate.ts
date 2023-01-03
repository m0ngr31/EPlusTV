import _ from 'lodash';

import {sleep} from './shared-helpers';

const all_segments = [
  {
    file: '000000000',
    inf: '2.502500',
  },
  {
    file: '000000001',
    inf: '2.502500',
  },
  {
    file: '000000002',
    inf: '1.251256',
  },
  {
    file: '000000003',
    inf: '2.502500',
  },
  {
    file: '000000004',
    inf: '1.251244',
  },
  {
    file: '000000005',
    inf: '1.001067',
  },
];

class SlateStream {
  private currentSequence = 0;
  private currentSegment = 0;

  constructor() {
    (async () => {
      let currentIndex = 0;

      while (currentIndex < all_segments.length) {
        await sleep(parseFloat(all_segments[currentIndex].inf) * 1000);
        this.increment();

        if (currentIndex < 5) {
          currentIndex += 1;
        } else {
          currentIndex = 0;
        }
      }
    })();
  }

  public getSlate(slate: string, uri) {
    const segments = this.getSegments();
    const m3u8 = `${this.writeHeader()}${this.writeSegments(
      segments,
      slate,
      uri,
    )}`;

    return m3u8;
  }

  private increment() {
    if (this.currentSegment < 5) {
      this.currentSegment += 1;
    } else {
      this.currentSegment = 0;
    }

    if (this.currentSequence < 100000) {
      this.currentSequence += 1;
    } else {
      this.currentSequence = 0;
    }
  }

  private getSegments() {
    switch (this.currentSegment) {
      case 0:
        return all_segments;
      case 1:
        return [..._.takeRight(all_segments, 5), ..._.take(all_segments, 1)];
      case 2:
        return [..._.takeRight(all_segments, 4), ..._.take(all_segments, 2)];
      case 3:
        return [..._.takeRight(all_segments, 3), ..._.take(all_segments, 3)];
      case 4:
        return [..._.takeRight(all_segments, 2), ..._.take(all_segments, 4)];
      case 5:
        return [..._.takeRight(all_segments, 1), ..._.take(all_segments, 5)];
    }
  }

  private writeHeader() {
    return `#EXTM3U
#EXT-X-TARGETDURATION:3
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:${this.currentSequence}`;
  }

  private writeSegments(segments, slate, uri) {
    let body = '';

    _.forEach(segments, segment => {
      body = `${body}\n#EXT-X-DISCONTINUITY\n#EXTINF:${segment.inf},\n${uri}/channels/${slate}/${segment.file}.ts`;
    });

    return `${body}\n`;
  }
}

export const slateStream = new SlateStream();
