import _ from 'lodash';

import {CHANNELS} from './channels';
import {getLinearStartChannel, getNumberOfChannels, getStartChannel} from './misc-db-service';

export const generateM3u = async (uri: string, linear = false): Promise<string> => {
  const startChannel = await getStartChannel();
  const numOfChannels = await getNumberOfChannels();
  const linearStartChannel = await getLinearStartChannel();

  let m3uFile = '#EXTM3U';

  if (linear) {
    for (const key in CHANNELS.MAP) {
      const val = CHANNELS.MAP[key];

      if (val.checkChannelEnabled) {
        const enabled = await val.checkChannelEnabled();

        if (!enabled) {
          continue;
        }
      }

      const channelNum = parseInt(key, 10) + linearStartChannel;
      m3uFile = `${m3uFile}\n#EXTINF:0 tvg-id="${channelNum}.eplustv" channel-id="${val.name}" channel-number="${channelNum}" tvg-chno="${channelNum}" tvg-name="${val.tvgName}" tvc-guide-stationid="${val.stationId}" group-title="EPlusTV", ${val.name}`;
      m3uFile = `${m3uFile}\n${uri}/channels/${channelNum}.m3u8\n`;
    }
  } else {
    _.times(numOfChannels, i => {
      const channelNum = startChannel + i;
      m3uFile = `${m3uFile}\n#EXTINF:0 tvg-id="${channelNum}.eplustv" channel-number="${channelNum}" tvg-chno="${channelNum}" tvg-name="EPlusTV ${channelNum}" group-title="EPlusTV", EPlusTV ${channelNum}`;
      m3uFile = `${m3uFile}\n${uri}/channels/${channelNum}.m3u8\n`;
    });
  }

  return m3uFile;
};
