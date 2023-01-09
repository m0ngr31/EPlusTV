import _ from 'lodash';

import {NUM_OF_CHANNELS, START_CHANNEL} from './channels';

export const generateM3u = (uri: string): string => {
  let m3uFile = '#EXTM3U';

  _.times(NUM_OF_CHANNELS, i => {
    const channelNum = START_CHANNEL + i;
    m3uFile = `${m3uFile}\n#EXTINF:0 tvg-id="${channelNum}.eplustv" channel-number="${channelNum}" tvg-chno="${channelNum}" tvg-name="EPlusTV ${channelNum}" group-title="EPlusTV", EPlusTV ${channelNum}`;
    m3uFile = `${m3uFile}\n${uri}/channels/${channelNum}.m3u8\n`;
  });

  return m3uFile;
};
