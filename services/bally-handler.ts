import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {normalTimeRange} from './shared-helpers';
import {debug} from './debug';
import {usesLinear} from './misc-db-service';

interface IBallyTeam {
  name: string;
  logo_svg: string;
  color_base: string;
}

interface IBallyEvent {
  id: number;
  date_time: string;
  channel_name: string;
  public_cdn_url: string;
  home_team: IBallyTeam;
  away_team: IBallyTeam;
}

interface IBallyLinearEvent {
  id: number;
  title: string;
  since: string;
  till: string;
  channelUuid: number;
}

interface IBallyEPGRes {
  games: IBallyEvent[];
}

interface IBallyLinearEPGRes {
  events: IBallyLinearEvent[];
}

const API_KEY = [
  '9',
  '9',
  'c',
  '1',
  'd',
  '4',
  'f',
  'a',
  '-',
  'u',
  't',
  'x',
  'j',
  '-',
  '9',
  '9',
  '3',
  '6',
  '-',
  'f',
  '9',
  'a',
  'e',
  '-',
  'a',
  'd',
  '3',
  'c',
  '4',
  '3',
  'b',
  '8',
  'e',
  '4',
  'f',
  '5',
].join('');

const CHANNEL_IMAGE_MAP = {
  1001: 'https://tmsimg.fancybits.co/assets/s131359_ll_h9_aa.png?w=360&h=270',
  15: 'https://tmsimg.fancybits.co/assets/s104950_ll_h15_aa.png?w=360&h=270',
  2: 'https://assets-stratosphere.cdn.ballys.tv/images/MiLB_New_Logo_23.png',
  29: 'https://assets-stratosphere.cdn.ballys.tv/images/BananaBall_SB_01.png',
  6: 'https://assets-stratosphere.ballys.tv/images/BallyPoker_Channel_V3.png',
} as const;

const CHANNEL_MAP = {
  1001: 'GLORY',
  15: 'STADIUM',
  2: 'MiLB',
  29: 'bananaball',
  6: 'ballypoker',
} as const;

const CHANNEL_MAP_SWAP = {
  GLORY: 1001,
  MiLB: 2,
  STADIUM: 15,
  ballypoker: 6,
  bananaball: 29,
} as const;

const parseAirings = async (events: IBallyEvent[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `bally-${event.id}`});

    if (!entryExists) {
      const start = moment(event.date_time);
      const end = moment(start).add(4, 'hours');
      const originalEnd = moment(start).add(3, 'hours');

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      const eventName = `${event.away_team.name} at ${event.home_team.name}`;

      console.log('Adding event: ', eventName);

      await db.entries.insertAsync<IEntry>({
        categories: ['MiLB', 'Baseball', event.away_team.name, event.home_team.name, 'Bally Sports'],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'bally',
        id: `bally-${event.id}`,
        image: 'https://img.mlbstatic.com/milb-images/image/upload/t_16x9/t_w2208/milb/omagzj463xltjyijyzzr',
        name: eventName,
        network: 'Bally Sports Live',
        originalEnd: originalEnd.valueOf(),
        sport: 'MiLB',
        start: start.valueOf(),
        url: event.public_cdn_url,
      });
    }
  }
};

const parseLinearAirings = async (events: IBallyLinearEvent[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `bally-live-${event.id}`});

    if (!entryExists) {
      const start = moment(event.since);
      const end = moment(event.till);

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insertAsync<IEntry>({
        categories: ['Bally Sports'],
        channel: CHANNEL_MAP[event.channelUuid],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'bally',
        id: `bally-live-${event.id}`,
        image: CHANNEL_IMAGE_MAP[event.channelUuid],
        linear: true,
        name: event.title,
        network: 'Bally Sports Live',
        start: start.valueOf(),
      });
    }
  }
};

class BallyHandler {
  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'bally'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const useLinear = await usesLinear();

      await db.providers.insertAsync<IProvider<TBallyTokens>>({
        enabled: false,
        linear_channels: [
          {
            enabled: useLinear,
            id: 'STADIUM',
            name: 'Stadium HD',
            tmsId: '104950',
          },
          {
            enabled: useLinear,
            id: 'MiLB',
            name: 'MiLB',
          },
          {
            enabled: useLinear,
            id: 'bananaball',
            name: 'Banana Ball',
          },
          {
            enabled: useLinear,
            id: 'ballypoker',
            name: 'Bally Poker',
          },
          {
            enabled: useLinear,
            id: 'GLORY',
            name: 'GLORY Kickboxing',
            tmsId: '131359',
          },
        ],
        name: 'bally',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'bally'});

    if (!enabled) {
      return;
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled, linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'bally'});

    if (!enabled) {
      return;
    }

    console.log('Looking for Bally Sports events...');

    const entries: IBallyEvent[] = [];
    const linearEntries: IBallyLinearEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = [
        'https://',
        'api-prod.prod2.ballylive.app',
        '/main/api/v1',
        '/content-service',
        '/mlb/schedule',
        '?startDate=',
        now.format('YYYY-MM-DD'),
        '&endDate=',
        endSchedule.format('YYYY-MM-DD'),
        '&includeFakeGames=false',
      ].join('');

      const {data} = await axios.get<IBallyEPGRes[]>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          'x-api-key': API_KEY,
        },
      });

      debug.saveRequestData(data, 'bally', 'epg');

      data.forEach(e => e.games.forEach(g => entries.push(g)));

      const useLinear = await usesLinear();

      if (useLinear) {
        const linearUrl = ['https://', 'api-prod.prod2.ballylive.app', '/main/video/epg'].join('');

        const {data: linearData} = await axios.get<IBallyLinearEPGRes>(linearUrl, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'x-api-key': API_KEY,
          },
        });

        const linearChannelMap = new Map();

        linearData.events.forEach(e => {
          const channelId = CHANNEL_MAP[e.channelUuid];

          let enabled = false;

          if (!linearChannelMap.has(channelId)) {
            enabled = linear_channels.find(c => c.id === channelId)?.enabled;
            linearChannelMap.set(channelId, enabled);
          } else {
            enabled = linearChannelMap.get(channelId);
          }

          if (enabled) {
            linearEntries.push(e);
          }
        });
      }
    } catch (e) {
      console.error(e);
      console.log('Could not parse Bally Sports events');
    }

    await parseAirings(entries);
    await parseLinearAirings(linearEntries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const event = await db.entries.findOneAsync<IEntry>({id: eventId});

    try {
      if (eventId.indexOf('bally-live-') > -1) {
        const {channel} = event;

        const channelId = CHANNEL_MAP_SWAP[channel];
        const url = ['https://', 'api-prod.prod2.ballylive.app', '/main/video/linear-channels'].join('');

        const {data} = await axios.get(url, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'x-api-key': API_KEY,
          },
        });

        const channelData = data.channels.find(c => c.uuid === channelId);

        if (channelData) {
          return [channelData.stream_info.apple_tv.default_abr, {}];
        } else {
          throw new Error('Could not start playback');
        }
      }

      let streamUrl: string;

      if (event.url) {
        streamUrl = event.url;
      }

      return [streamUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };
}

export type TBallyTokens = ClassTypeWithoutMethods<BallyHandler>;

export const ballyHandler = new BallyHandler();
