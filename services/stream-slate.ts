import _ from 'lodash';

class SlateStream {
  private currentSequence: number = 0;
  private currentSegment: number = 0;
  private segments = [
    {
      inf: '2.502500',
      file: '000000000.ts',
    },
    {
      inf: '2.502500',
      file: '000000001.ts',
    },
    {
      inf: '1.251256',
      file: '000000002.ts',
    },
    {
      inf: '2.502500',
      file: '000000003.ts',
    },
    {
      inf: '1.251244',
      file: '000000004.ts',
    },
    {
      inf: '1.001067',
      file: '000000005.ts',
    },
  ];

  constructor() {
    setInterval(() => this.increment(), 2 * 1000);
  }

  public getSlate(slate: string, uri) {
    const segments = this.getSegments();
    const m3u8 = `${this.writeHeader()}${this.writeSegments(segments, slate, uri)}`;

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
        return _.take(this.segments, 5);
        break;
      case 1:
        return _.takeRight(this.segments, 5);
        break;
      case 2:
        return [..._.takeRight(this.segments, 4), ..._.take(this.segments, 1)];
        break;
      case 3:
        return [..._.takeRight(this.segments, 3), ..._.take(this.segments, 2)];
        break;
      case 4:
        return [..._.takeRight(this.segments, 2), ..._.take(this.segments, 3)];
        break;
      case 5:
        return [..._.takeRight(this.segments, 1), ..._.take(this.segments, 4)];
        break;
    }
  }

  private writeHeader() {
    return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:${this.currentSequence}`;
  }

  private writeSegments(segments, slate, uri) {
    let body = '';

    _.forEach(segments, segment => {
      body = `${body}\n#EXTINF:${segment.inf},\n${uri}/channels/${slate}/${segment.file}`
    });

    return body;
  }
}

export const slateStream = new SlateStream();