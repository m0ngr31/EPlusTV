import axios from 'axios';
import moment from 'moment';
import _ from 'lodash';

import {nhlTvUserAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID, normalTimeRange} from './shared-helpers';
import {debug} from './debug';

interface ICompetetitor {
  name: string;
}

interface IImage {
  path: string;
  manipulations: string[];
}

interface IContent {
  id: string;
  path?: string | null;
  playtime: number;
  distributionType: {
    name: 'Live' | 'VOD';
  };
  clientContentMetadata?: {
    id: string;
    name: 'HOME' | 'AWAY' | string;
  }[];
}

interface INHLEvent {
  homeCompetitor: ICompetetitor;
  awayCompetitor: ICompetetitor;
  images: IImage[];
  startTime: string;
  content: IContent[];
}

interface INHLEventSimple {
  id: string;
  duration: number;
  start: string;
  name: string;
  image: string;
  feed: string;
}

const BASE_API = 'https://nhltv.nhl.com/api';

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': nhlTvUserAgent,
};

const getGameName = (event: INHLEvent): string =>
  `${_.startCase(event.homeCompetitor.name.toLowerCase())} vs ${_.startCase(event.awayCompetitor.name.toLowerCase())}`;

const getBroadcastName = (event: INHLEvent, broadcast: 'HOME' | 'AWAY' | string): string => {
  if (broadcast !== 'HOME' && broadcast !== 'AWAY') {
    return broadcast;
  }

  return `${_.startCase(
    broadcast === 'HOME' ? event.homeCompetitor.name.toLowerCase() : event.awayCompetitor.name.toLowerCase(),
  )} Feed`;
};

const getGameImage = (event: INHLEvent): string => {
  const image = event.images.find(i => i.manipulations.some(m => m === 'original'));

  if (image) {
    return `https://nhltv.nhl.com/image/original/${image.path}`;
  }

  return '';
};

const parseAirings = async (events: INHLEventSimple[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `nhl-${event.id}`});

    if (!entryExists) {
      const start = moment(event.start);
      const end = moment(event.start).add(4, 'hours');
      const originalEnd = moment(event.start).add(event.duration, 'seconds');

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', event.name);

      await db.entries.insertAsync<IEntry>({
        categories: ['NHL', 'Ice Hockey'],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        feed: event.feed,
        from: 'nhl',
        id: `nhl-${event.id}`,
        image: event.image,
        name: event.name,
        network: 'NHL.tv',
        originalEnd: originalEnd.valueOf(),
        sport: 'NHL',
        start: start.valueOf(),
      });
    }
  }
};

class NHLHandler {
  public device_id?: string;
  public session_token?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'nhl'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const data: TNHLTokens = {};

      await db.providers.insertAsync<IProvider<TNHLTokens>>({
        enabled: false,
        name: 'nhl',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nhl'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nhl'});

    if (!enabled) {
      return;
    }

    await this.extendSessionToken();
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nhl'});

    if (!enabled) {
      return;
    }

    await this.extendSessionToken();

    console.log('Looking for NHL.tv events...');

    const entries: INHLEventSimple[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = [
        BASE_API,
        '/v2/events',
        '?date_time_from=',
        now.format(),
        '&date_time_to=',
        endSchedule.format(),
        '&metadata_id=259346',
        '&sort_direction=asc',
        '&limit=100',
      ].join('');

      const {data} = await axios.get<{data: INHLEvent[]}>(url, {
        headers: {
          ...COMMON_HEADERS,
          cookie: `token=${this.session_token}`,
        },
      });

      debug.saveRequestData(data.data, 'nhl', 'epg');

      data.data.forEach(game => {
        game.content.forEach(feed => {
          if (
            feed.distributionType?.name === 'Live' &&
            feed.clientContentMetadata.length > 0 &&
            feed.clientContentMetadata[0].name !== 'FRENCH'
          ) {
            entries.push({
              duration: feed.playtime || 240 * 60,
              feed: getBroadcastName(game, feed.clientContentMetadata[0].name),
              id: feed.id,
              image: getGameImage(game),
              name: getGameName(game),
              start: game.startTime,
            });
          }
        });
      });
    } catch (e) {
      console.error(e);
      console.log('Could not parse NHL Sports events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    await this.extendSessionToken();

    const realEventId = eventId.replace('nhl-', '');

    try {
      const checkAccessUrl = [BASE_API, '/v3/contents/', realEventId, '/check-access'].join('');

      const {data} = await axios.post(
        checkAccessUrl,
        {},
        {
          headers: {
            ...COMMON_HEADERS,
            authorization: `Bearer ${this.session_token}`,
            cookie: `token=${this.session_token}`,
          },
        },
      );

      const playbackToken: string = data.data;

      const playbackInfoUrl = [BASE_API, '/v2/content/', realEventId, '/access/hls'].join('');

      const {data: playbackData} = await axios.post(
        playbackInfoUrl,
        {},
        {
          headers: {
            ...COMMON_HEADERS,
            authorization: `Bearer ${playbackToken}`,
            cookie: `token=${this.session_token}`,
          },
        },
      );

      return [playbackData.data.stream, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.device_id = getRandomUUID();

    try {
      const url = [BASE_API, '/v3/sso/nhl', '/request-signin-code'].join('');

      const {data} = await axios.post(
        url,
        {
          device_id: this.device_id,
        },
        {
          headers: {
            ...COMMON_HEADERS,
          },
        },
      );

      return data.code;
    } catch (e) {
      console.error(e);
      console.log('Could not login to NHL Sports');
    }
  };

  public authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = [BASE_API, '/v3/sso/nhl', '/signin-with-code'].join('');

      const {data} = await axios.post(
        url,
        {
          code,
          device_id: this.device_id,
        },
        {
          headers: {
            ...COMMON_HEADERS,
          },
        },
      );

      if (!data || !data?.token) {
        return false;
      }

      this.session_token = data.token;
      await this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private extendSessionToken = async (): Promise<void> => {
    const url = [BASE_API, '/v3/sso/nhl', '/extend_token'].join('');

    try {
      const {data} = await axios.post(
        url,
        {},
        {
          headers: {
            ...COMMON_HEADERS,
            authorization: `Bearer: ${this.session_token}`,
            cookie: `token=${this.session_token}`,
          },
        },
      );

      this.session_token = data.token;

      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not extend NHL TV token');
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'nhl'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TNHLTokens>>({name: 'nhl'});
    const {device_id, session_token} = tokens || {};

    this.device_id = device_id;
    this.session_token = session_token;
  };
}

export type TNHLTokens = ClassTypeWithoutMethods<NHLHandler>;

export const nhlHandler = new NHLHandler();
