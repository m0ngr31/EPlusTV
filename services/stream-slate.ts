import _ from 'lodash';

import {generateRandom} from './shared-helpers';

const SEGMENTS = [generateRandom(8), generateRandom(8), generateRandom(8)];

export const getSlate = (uri: string): string => {
  let playlist = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:0`;

  _.forEach(SEGMENTS, segment => {
    playlist = `${playlist}\n#EXTINF:4.000000,\n${uri}/channels/slate/${segment}.ts`;
  });

  return playlist;
};
