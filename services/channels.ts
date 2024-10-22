import _ from 'lodash';

import {useMsgPlus} from './networks';
import {db} from './database';
import {IProvider} from './shared-interfaces';

let startChannel = _.toNumber(process.env.START_CHANNEL);
if (_.isNaN(startChannel)) {
  startChannel = 1;
}

let numOfChannels = _.toNumber(process.env.NUM_OF_CHANNELS);
if (_.isNaN(numOfChannels)) {
  numOfChannels = 200;
}

const nextStartChannel = (end: number, buffer: number): number => {
  const sum = end + buffer;

  // Round up to the next hundred
  let nextHundred = Math.ceil(sum / 100) * 100;

  // Check if the result is at least 50 more than X
  if (nextHundred - end < buffer) {
    nextHundred += 100;
  }

  return nextHundred;
};

export const START_CHANNEL = startChannel;
export const NUM_OF_CHANNELS = numOfChannels;

const BUFFER_CHANNELS = 50;
export const LINEAR_START_CHANNEL = nextStartChannel(startChannel + numOfChannels, BUFFER_CHANNELS);

export const useLinear = process.env.LINEAR_CHANNELS?.toLowerCase() === 'true' ? true : false;

export const checkChannelEnabled = async (provider: string, channelId: string): Promise<boolean> => {
  const {enabled, linear_channels} = await db.providers.findOne<IProvider>({name: provider});

  if (!enabled || !linear_channels || !linear_channels.length) {
    return false;
  }

  const network = linear_channels.find(c => c.id === channelId);

  return network?.enabled;
};

/* eslint-disable sort-keys-custom-order-fix/sort-keys-custom-order-fix */
export const CHANNELS = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  get MAP() {
    return {
      0: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espn1'),
        id: 'espn1',
        logo: 'https://tmsimg.fancybits.co/assets/s32645_h3_aa.png?w=360&h=270',
        name: 'ESPN',
        stationId: '32645',
        tvgName: 'ESPNHD',
      },
      1: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espn2'),
        id: 'espn2',
        logo: 'https://tmsimg.fancybits.co/assets/s45507_ll_h15_aa.png?w=360&h=270',
        name: 'ESPN2',
        stationId: '45507',
        tvgName: 'ESPN2HD',
      },
      2: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espnu'),
        id: 'espnu',
        logo: 'https://tmsimg.fancybits.co/assets/s60696_ll_h15_aa.png?w=360&h=270',
        name: 'ESPNU',
        stationId: '60696',
        tvgName: 'ESPNUHD',
      },
      3: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'sec'),
        id: 'sec',
        logo: 'https://tmsimg.fancybits.co/assets/s89714_ll_h15_aa.png?w=360&h=270',
        name: 'SEC Network',
        stationId: '89714',
        tvgName: 'SECH',
      },
      4: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'acc'),
        id: 'acc',
        logo: 'https://tmsimg.fancybits.co/assets/s111871_ll_h15_ac.png?w=360&h=270',
        name: 'ACC Network',
        stationId: '111871',
        tvgName: 'ACC',
      },
      5: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espnews'),
        id: 'espnews',
        logo: 'https://tmsimg.fancybits.co/assets/s59976_ll_h15_aa.png?w=360&h=270',
        name: 'ESPNews',
        stationId: '59976',
        tvgName: 'ESPNWHD',
      },
      10: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fs1'),
        id: 'fs1',
        logo: 'https://tmsimg.fancybits.co/assets/s82547_ll_h15_aa.png?w=360&h=270',
        name: 'FS1',
        stationId: '82547',
        tvgName: 'FS1HD',
      },
      11: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fs2'),
        id: 'fs2',
        logo: 'https://tmsimg.fancybits.co/assets/s59305_ll_h15_aa.png?w=360&h=270',
        name: 'FS2',
        stationId: '59305',
        tvgName: 'FS2HD',
      },
      12: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'btn'),
        id: 'btn',
        logo: 'https://tmsimg.fancybits.co/assets/s58321_ll_h15_ac.png?w=360&h=270',
        name: 'B1G Network',
        stationId: '58321',
        tvgName: 'BIG10HD',
      },
      13: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fox-soccer-plus'),
        id: 'fox-soccer-plus',
        logo: 'https://tmsimg.fancybits.co/assets/s66880_ll_h15_aa.png?w=360&h=270',
        name: 'FOX Soccer Plus',
        stationId: '66880',
        tvgName: 'FSCPLHD',
      },
      20: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('paramount', 'cbssportshq'),
        id: 'cbssportshq',
        logo: 'https://tmsimg.fancybits.co/assets/s108919_ll_h15_aa.png?w=360&h=270',
        name: 'CBS Sports HQ',
        stationId: '108919',
        tvgName: 'CBSSPHQ',
      },
      21: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('paramount', 'golazo'),
        id: 'golazo',
        logo: 'https://tmsimg.fancybits.co/assets/s133691_ll_h15_aa.png?w=360&h=270',
        name: 'GOLAZO Network',
        stationId: '133691',
        tvgName: 'GOLAZO',
      },
      30: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLNETWORK'),
        id: 'NFLNETWORK',
        logo: 'https://tmsimg.fancybits.co/assets/s45399_ll_h15_aa.png?w=360&h=270',
        name: 'NFL Network',
        stationId: '45399',
        tvgName: 'NFLHD',
      },
      31: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLNRZ'),
        id: 'NFLNRZ',
        logo: 'https://tmsimg.fancybits.co/assets/s65025_ll_h9_aa.png?w=360&h=270',
        name: 'NFL RedZone',
        stationId: '65025',
        tvgName: 'NFLNRZD',
      },
      32: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLDIGITAL1_OO_v3'),
        id: 'NFLDIGITAL1_OO_v3',
        logo: 'https://tmsimg.fancybits.co/assets/s121705_ll_h15_aa.png?w=360&h=270',
        name: 'NFL Channel',
        stationId: '121705',
        tvgName: 'NFLDC1',
      },
      40: {
        canUse: undefined,
        checkChannelEnabled: async (): Promise<boolean> => {
          const {linear_channels, meta} = await db.providers.findOne<IProvider>({name: 'mlbtv'});

          return linear_channels[0].enabled && !meta.onlyFree;
        },
        id: 'MLBTVBI',
        logo: 'https://tmsimg.fancybits.co/assets/s119153_ll_h15_aa.png?w=360&h=270',
        name: 'MLB Big Inning',
        stationId: '119153',
        tvgName: 'MLBTVBI',
      },
      50: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('nesn', 'NESN'),
        id: 'NESN',
        logo: 'https://tmsimg.fancybits.co/assets/s35038_ll_h15_ac.png?w=360&h=270',
        name: 'New England Sports Network HD',
        stationId: '35038',
        tvgName: 'NESNHD',
      },
      51: {
        canUse: undefined,
        checkChannelEnabled: () => checkChannelEnabled('nesn', 'NESN+'),
        id: 'NESN+',
        logo: 'https://tmsimg.fancybits.co/assets/s63198_ll_h15_ac.png?w=360&h=270',
        name: 'New England Sports Network Plus HD',
        stationId: '63516',
        tvgName: 'NESNPLD',
      },
      60: {
        canUse: useMsgPlus,
        id: 'MSG',
        logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
        name: 'MSG',
        stationId: '10979',
        tvgName: 'MSG',
      },
      61: {
        canUse: useMsgPlus,
        id: 'MSGSN',
        logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
        name: 'MSG Sportsnet HD',
        stationId: '15273',
        tvgName: 'MSGSNNP',
      },
      62: {
        canUse: useMsgPlus,
        id: 'MSG2',
        logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
        name: 'MSG2 HD',
        stationId: '70283',
        tvgName: 'MSG2HD',
      },
      63: {
        canUse: useMsgPlus,
        id: 'MSGSN2',
        logo: 'https://tmsimg.fancybits.co/assets/s70285_ll_h15_ab.png?w=360&h=270',
        name: 'MSG Sportsnet 2 HD',
        stationId: '70285',
        tvgName: 'MSG2SNH',
      },
    };
  },
};
/* eslint-enable sort-keys-custom-order-fix/sort-keys-custom-order-fix */

export const calculateChannelNumber = (channelNum: string): number | string => {
  const chanNum = parseInt(channelNum, 10);

  if (!useLinear || chanNum < LINEAR_START_CHANNEL) {
    return channelNum;
  }

  const linearChannel = CHANNELS.MAP[chanNum - LINEAR_START_CHANNEL];

  if (linearChannel) {
    return linearChannel.id;
  }

  return channelNum;
};

export const calculateChannelFromName = (channelName: string): number => {
  const isNumber = Number.isFinite(parseInt(channelName, 10));

  if (isNumber) {
    return parseInt(channelName, 10);
  }

  let channelNum = Number.MAX_SAFE_INTEGER;

  _.forOwn(CHANNELS.MAP, (val, key) => {
    if (val.id === channelName) {
      channelNum = parseInt(key, 10) + LINEAR_START_CHANNEL;
    }
  });

  return channelNum;
};
