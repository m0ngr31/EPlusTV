import _ from 'lodash';

export const generateM3u = (
  numChannels: number,
  uri: string,
  startChannel: number,
): string => {
  let m3uFile = '#EXTM3U';

  _.times(numChannels, i => {
    const channelNum = startChannel + i;
    m3uFile = `${m3uFile}\n#EXTINF:0 tvg-id="${channelNum}.eplustv" channel-number="${channelNum}" tvg-chno="${channelNum}" tvg-name="EPlusTV ${channelNum}" group-title="EPlusTV", EPlusTV ${channelNum}`;
    m3uFile = `${m3uFile}\n${uri}/channels/${channelNum}.m3u8\n`;
  });

  return m3uFile;
};
