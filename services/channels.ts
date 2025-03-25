import _ from 'lodash';

import {db} from './database';
import {IProvider} from './shared-interfaces';
import {getLinearStartChannel, usesLinear} from './misc-db-service';
import {gothamHandler} from './gotham-handler';

export const checkChannelEnabled = async (provider: string, channelId: string): Promise<boolean> => {
  const {enabled, linear_channels} = await db.providers.findOneAsync<IProvider>({name: provider});

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
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espn1'),
        id: 'espn1',
        logo: 'https://tmsimg.fancybits.co/assets/s32645_h3_aa.png?w=360&h=270',
        name: 'ESPN',
        stationId: '32645',
        tvgName: 'ESPNHD',
      },
      1: {
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espn2'),
        id: 'espn2',
        logo: 'https://tmsimg.fancybits.co/assets/s45507_ll_h15_aa.png?w=360&h=270',
        name: 'ESPN2',
        stationId: '45507',
        tvgName: 'ESPN2HD',
      },
      2: {
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espnu'),
        id: 'espnu',
        logo: 'https://tmsimg.fancybits.co/assets/s60696_ll_h15_aa.png?w=360&h=270',
        name: 'ESPNU',
        stationId: '60696',
        tvgName: 'ESPNUHD',
      },
      3: {
        checkChannelEnabled: () => checkChannelEnabled('espn', 'sec'),
        id: 'sec',
        logo: 'https://tmsimg.fancybits.co/assets/s89714_ll_h15_aa.png?w=360&h=270',
        name: 'SEC Network',
        stationId: '89714',
        tvgName: 'SECH',
      },
      4: {
        checkChannelEnabled: () => checkChannelEnabled('espn', 'acc'),
        id: 'acc',
        logo: 'https://tmsimg.fancybits.co/assets/s111871_ll_h15_ac.png?w=360&h=270',
        name: 'ACC Network',
        stationId: '111871',
        tvgName: 'ACC',
      },
      5: {
        checkChannelEnabled: () => checkChannelEnabled('espn', 'espnews'),
        id: 'espnews',
        logo: 'https://tmsimg.fancybits.co/assets/s59976_ll_h15_aa.png?w=360&h=270',
        name: 'ESPNews',
        stationId: '59976',
        tvgName: 'ESPNWHD',
      },
      10: {
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fs1'),
        id: 'fs1',
        logo: 'https://tmsimg.fancybits.co/assets/s82547_ll_h15_aa.png?w=360&h=270',
        name: 'FS1',
        stationId: '82547',
        tvgName: 'FS1HD',
      },
      11: {
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fs2'),
        id: 'fs2',
        logo: 'https://tmsimg.fancybits.co/assets/s59305_ll_h15_aa.png?w=360&h=270',
        name: 'FS2',
        stationId: '59305',
        tvgName: 'FS2HD',
      },
      12: {
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'btn'),
        id: 'btn',
        logo: 'https://tmsimg.fancybits.co/assets/s58321_ll_h15_ac.png?w=360&h=270',
        name: 'B1G Network',
        stationId: '58321',
        tvgName: 'BIG10HD',
      },
      13: {
        checkChannelEnabled: () => checkChannelEnabled('foxsports', 'fox-soccer-plus'),
        id: 'fox-soccer-plus',
        logo: 'https://tmsimg.fancybits.co/assets/s66880_ll_h15_aa.png?w=360&h=270',
        name: 'FOX Soccer Plus',
        stationId: '66880',
        tvgName: 'FSCPLHD',
      },
      20: {
        checkChannelEnabled: () => checkChannelEnabled('paramount', 'cbssportshq'),
        id: 'cbssportshq',
        logo: 'https://tmsimg.fancybits.co/assets/s108919_ll_h15_aa.png?w=360&h=270',
        name: 'CBS Sports HQ',
        stationId: '108919',
        tvgName: 'CBSSPHQ',
      },
      21: {
        checkChannelEnabled: () => checkChannelEnabled('paramount', 'golazo'),
        id: 'golazo',
        logo: 'https://tmsimg.fancybits.co/assets/s133691_ll_h15_aa.png?w=360&h=270',
        name: 'GOLAZO Network',
        stationId: '133691',
        tvgName: 'GOLAZO',
      },
      30: {
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLNETWORK'),
        id: 'NFLNETWORK',
        logo: 'https://tmsimg.fancybits.co/assets/s45399_ll_h15_aa.png?w=360&h=270',
        name: 'NFL Network',
        stationId: '45399',
        tvgName: 'NFLHD',
      },
      31: {
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLNRZ'),
        id: 'NFLNRZ',
        logo: 'https://tmsimg.fancybits.co/assets/s65025_ll_h9_aa.png?w=360&h=270',
        name: 'NFL RedZone',
        stationId: '65025',
        tvgName: 'NFLNRZD',
      },
      32: {
        checkChannelEnabled: () => checkChannelEnabled('nfl', 'NFLDIGITAL1_OO_v3'),
        id: 'NFLDIGITAL1_OO_v3',
        logo: 'https://tmsimg.fancybits.co/assets/s121705_ll_h15_aa.png?w=360&h=270',
        name: 'NFL Channel',
        stationId: '121705',
        tvgName: 'NFLDC1',
      },
      40: {
        checkChannelEnabled: async (): Promise<boolean> => {
          const {linear_channels, meta} = await db.providers.findOneAsync<IProvider>({name: 'mlbtv'});

          return linear_channels[0].enabled && !meta.onlyFree;
        },
        id: 'MLBTVBI',
        logo: 'https://tmsimg.fancybits.co/assets/s119153_ll_h15_aa.png?w=360&h=270',
        name: 'MLB Big Inning',
        stationId: '119153',
        tvgName: 'MLBTVBI',
      },
      41: {
        checkChannelEnabled: () => checkChannelEnabled('mlbtv', 'MLBN'),
        id: 'MLBN',
        logo: 'https://tmsimg.fancybits.co/assets/s62079_ll_h15_aa.png?w=360&h=270',
        name: 'MLB Network',
        stationId: '62079',
        tvgName: 'MLBN',
      },
      50: {
        checkChannelEnabled: () => checkChannelEnabled('nesn', 'NESN'),
        id: 'NESN',
        logo: 'https://tmsimg.fancybits.co/assets/s35038_ll_h15_ac.png?w=360&h=270',
        name: 'New England Sports Network HD',
        stationId: '35038',
        tvgName: 'NESNHD',
      },
      51: {
        checkChannelEnabled: () => checkChannelEnabled('nesn', 'NESN+'),
        id: 'NESN+',
        logo: 'https://tmsimg.fancybits.co/assets/s63198_ll_h15_ac.png?w=360&h=270',
        name: 'New England Sports Network Plus HD',
        stationId: '63516',
        tvgName: 'NESNPLD',
      },
      ...gothamHandler.getLinearChannels(),
      70: {
        checkChannelEnabled: async (): Promise<boolean> =>
          (await db.providers.findOneAsync<IProvider>({name: 'wsn'}))?.enabled,
        id: 'WSN',
        logo: 'https://tmsimg.fancybits.co/assets/s124636_ll_h15_aa.png?w=360&h=270',
        name: "Women's Sports Network",
        stationId: '124636',
        tvgName: 'WSN',
      },
    };
  },
};
/* eslint-enable sort-keys-custom-order-fix/sort-keys-custom-order-fix */

export const calculateChannelNumber = async (channelNum: string): Promise<number | string> => {
  const useLinear = await usesLinear();
  const linearStartChannel = await getLinearStartChannel();

  const chanNum = parseInt(channelNum, 10);

  if (!useLinear || chanNum < linearStartChannel) {
    return channelNum;
  }

  const linearChannel = CHANNELS.MAP[chanNum - linearStartChannel];

  if (linearChannel) {
    return linearChannel.id;
  }

  return channelNum;
};

export const calculateChannelFromName = async (channelName: string): Promise<number> => {
  const isNumber = Number.isFinite(parseInt(channelName, 10));

  if (isNumber) {
    return parseInt(channelName, 10);
  }

  const linearStartChannel = await getLinearStartChannel();

  let channelNum = Number.MAX_SAFE_INTEGER;

  _.forOwn(CHANNELS.MAP, (val, key) => {
    if (val.id === channelName) {
      channelNum = parseInt(key, 10) + linearStartChannel;
    }
  });

  return channelNum;
};

export const XMLTV_PADDING = process.env.XMLTV_PADDING?.toLowerCase() === 'false' ? false : true;
