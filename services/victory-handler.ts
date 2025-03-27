import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID, normalTimeRange} from './shared-helpers';
import {debug} from './debug';

interface IVictoryEvent {
  id: number;
  broadcast_start: number;
  broadcast_end: number;
  title: string;
  imageUrl: string;
  videoUrl: string;
  seriesId: string;
  episodeType: 'live' | string;
}

const BASE_URL = 'https://api.sports.aparentmedia.com/api/2.0';

const DEVICE_INFO = {
  device: 'AOSP TV on x86',
  kdApiVersion: '1',
  kdAppVersion: '10.3',
  language: 'en',
  osVersion: '31',
  platform: 'AndroidTV',
  requestCountry: true,
  screenDensityDPI: 640,
  screenResH: 2160,
  screenResW: 3840,
};

const ALLOWED_SERIES = ['66', '67', '68', '97', '99', '128', '139', '140', '141', '142'];

const fillEvent = (event: IVictoryEvent): [string, string[]] => {
  let sport = '';
  const categories = ['Victory+'];
  const seriesId = event.seriesId;

  if (seriesId === '66' || seriesId === '67' || seriesId === '68') {
    // Stars or Ducks or Blues game
    sport = 'Hockey';
    categories.push('Hockey', 'NHL');
  } else if (seriesId === '140' || seriesId === '141' || seriesId === '142') {
    // WHL
    sport = 'Hockey';
    categories.push('Hockey', 'WHL')
  } else if (seriesId === '97') {
    // Premier Lacrosse League
    sport = 'Lacrosse';
    categories.push('PLL');
  } else if (seriesId === '99') {
    // Major Arena Soccer League
    sport = 'Soccer';
    categories.push('Soccer', 'MASL');
  }

  return [sport, categories];
};

const parseAirings = async (events: IVictoryEvent[]) => {
  const [now, endDate] = normalTimeRange();
  const {meta} = await db.providers.findOneAsync<IProvider<TVictoryTokens>>({name: 'victory'});

  for (const event of events) {
    if (
      !event ||
      !event.id ||
      !ALLOWED_SERIES.includes(event.seriesId) ||
      (event.seriesId === '66' && !meta.stars) ||
      (event.seriesId === '67' && !meta.ducks) ||
      (event.seriesId === '68' && !meta.blues) ||
      (event.seriesId === '128' && !meta.rangers)
    ) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `victory-${event.id}`});

    if (!entryExists) {
      const start = moment(event.broadcast_start * 1000);
      const end = moment(event.broadcast_end * 1000).add(1, 'hour');
      const originalEnd = moment(event.broadcast_end * 1000);

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      const [sport, categories] = fillEvent(event);

      console.log('Adding event: ', event.title);

      await db.entries.insertAsync<IEntry>({
        categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'victory',
        id: `victory-${event.id}`,
        image: event.imageUrl,
        name: event.title,
        network: 'Victory+',
        originalEnd: originalEnd.valueOf(),
        sport,
        start: start.valueOf(),
        url: event.videoUrl,
      });
    }
  }
};

class VictoryHandler {
  public device_id?: string;
  public user_id?: string;
  public session_key?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'victory'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const data: TVictoryTokens = {};

      await db.providers.insertAsync<IProvider<TVictoryTokens>>({
        enabled: false,
        meta: {
          ducks: false,
          rangers: false,
          stars: false,
          blues: false,
        },
        name: 'victory',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'victory'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'victory'});

    if (!enabled) {
      return;
    }

    // Refresh logic
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'victory'});

    if (!enabled) {
      return;
    }

    console.log('Looking for Victory+ events...');

    const entries: IVictoryEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = [BASE_URL, '/content/categories/57'].join('');

      const {data} = await axios.get<{contents: IVictoryEvent[]}>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          'x-api-session': this.session_key,
        },
      });

      debug.saveRequestData(data.contents, 'victory', 'epg');

      data.contents.forEach(e => {
        if (moment(e.broadcast_start * 1000).isBefore(endSchedule) && moment(e.broadcast_end * 1000).isAfter(now)) {
          entries.push(e);
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not parse Victory+ events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const event = await db.entries.findOneAsync<IEntry>({id: eventId});
    const realEventId = event.id.split('victory-')[1];

    try {
      const url = [BASE_URL, '/live/default/', realEventId, '/manifest.json'].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          'x-api-session': this.session_key,
        },
      });

      return [data.manifestUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.device_id = getRandomUUID();

    const [guestUserId, guestSessionKey] = await this.registerGuestUser();

    this.user_id = guestUserId;
    this.session_key = guestSessionKey;

    try {
      const url = [...BASE_URL, '/users/rendezvous', '?userId=', guestUserId].join('');

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'x-kidoodle-session': this.session_key,
        },
      });

      return data.linkCode;
    } catch (e) {
      console.error(e);
      console.log('Could not get Victory+ login code');
    }
  };

  public authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = [...BASE_URL, '/users/rendezvous', '/currentUser'].join('');

      const {data} = await axios.post(
        url,
        {
          ...DEVICE_INFO,
          deviceId: this.device_id,
          linkCode: code,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'x-kidoodle-session': this.session_key,
          },
        },
      );

      if (!data || !data?.session_key || !data.id) {
        return false;
      }

      this.session_key = data.session_key;
      this.user_id = data.id;

      await this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private registerGuestUser = async (): Promise<[string, string]> => {
    const url = [...BASE_URL, '/users/register'].join('');

    try {
      const {data} = await axios.post(
        url,
        {
          createDefaultProfile: true,
          guestUser: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
          },
        },
      );

      return [data.id, data.session_key];
    } catch (e) {
      console.error(e);
      console.log('Could not create guest user for Victory+');
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'victory'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TVictoryTokens>>({name: 'victory'});
    const {device_id, user_id, session_key} = tokens || {};

    this.device_id = device_id;
    this.user_id = user_id;
    this.session_key = session_key;
  };
}

export type TVictoryTokens = ClassTypeWithoutMethods<VictoryHandler>;

export const victoryHandler = new VictoryHandler();
