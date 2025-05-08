import axios from 'axios';
import moment from 'moment';

import {okHttpUserAgent, userAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {normalTimeRange} from './shared-helpers';
import {debug} from './debug';

interface IWNBABroadcast {
  broadcasterDisplay: string;
  broadcasterVideoLink?: string;
}

interface IWNBATeam {
  id: string;
  teamName: string;
  teamCity: string;
}

interface IWNBAEvent {
  gameDateTimeUTC: string;
  gameId: string;
  broadcasters: {
    nationalTvBroadcasters: IWNBABroadcast[];
    nationalOttBroadcasters: IWNBABroadcast[];
  };
  homeTeam: IWNBATeam;
  awayTeam: IWNBATeam;
  ifNecessary: boolean;
}

interface IWNBASchedule {
  leagueSchedule: {
    gameDates: {
      games: IWNBAEvent[];
    }[];
  };
}

interface IWNBAMeta {
  username: string;
  password: string;
}

interface IWNBAEventDetail {
  accessLevel: string;
  playerUrlCallback: string;
  id: string;
  title: string;
  thumbnailUrl: string;
  startDate: string;
  endDate: string;
}

interface IWNBAStreamCallback {
  hls: {
    url: string;
  }[];
}

const API_KEY = [
  '9',
  '6',
  '5',
  '0',
  'f',
  'b',
  'b',
  '7',
  '-',
  '1',
  '1',
  '6',
  '7',
  '-',
  '4',
  '8',
  '9',
  'f',
  '-',
  '8',
  '4',
  '6',
  '1',
  '-',
  '4',
  'b',
  '2',
  '6',
  '5',
  'a',
  '6',
  '6',
  'b',
  'b',
  'e',
  'd',
].join('');

const APP_VAR = '18.1.0';

const BASE_API_URL = 'https://dce-frontoffice.imggaming.com/api';

const getEventId = (event: IWNBAEvent): string | undefined => {
  const wnbaLeaguePass = event?.broadcasters?.nationalOttBroadcasters?.find(
    b => b.broadcasterDisplay === 'WNBA League Pass',
  );

  const eventLink = wnbaLeaguePass?.broadcasterVideoLink;

  if (!eventLink) return;

  return eventLink.split('/').pop();
};

const getEventData = async (eventId: string): Promise<IWNBAEventDetail> => {
  try {
    const url = [BASE_API_URL, '/v4/event/', eventId, '?includePlaybackDetails=URL&displayGeoblocked=SHOW'].join('');

    const {data} = await axios.get<IWNBAEventDetail>(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': okHttpUserAgent,
        authorization: `Bearer ${wnbaHandler.token}`,
        realm: 'dce.wnba',
        'x-api-key': API_KEY,
        'x-app-var': APP_VAR,
      },
    });

    return data;
  } catch (e) {
    console.error(e);
    console.log('Could not get event data');
  }
};

const parseAirings = async (events: IWNBAEvent[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    const eventId = getEventId(event);

    if (!event || !eventId) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `wnba-${eventId}`});

    if (!entryExists) {
      const eventData = await getEventData(eventId);

      if (!eventData || eventData.accessLevel !== 'GRANTED') {
        continue;
      }

      const start = moment(eventData.startDate);
      const end = moment(eventData.endDate).add(1, 'hour');
      const originalEnd = moment(eventData.endDate);

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', eventData.title);

      await db.entries.insertAsync<IEntry>({
        categories: ['WNBA', 'Basketball', "Women's Sports", "Women's Basketball"],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'wnba',
        id: `wnba-${eventId}`,
        image: eventData.thumbnailUrl,
        name: eventData.title,
        network: 'WNBA League Pass',
        originalEnd: originalEnd.valueOf(),
        sport: 'WNBA',
        start: start.valueOf(),
      });
    }
  }
};

class WNBAHandler {
  public token?: string;
  public refresh_token?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'wnba'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const data: TWNBATokens = {};

      await db.providers.insertAsync<IProvider<TWNBATokens>>({
        enabled: false,
        name: 'wnba',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'wnba'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'wnba'});

    if (!enabled) {
      return;
    }

    try {
      const url = [BASE_API_URL, '/v2/token/refresh'].join('');

      const {data} = await axios.post(
        url,
        {refreshToken: this.refresh_token},
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
            authorization: `Bearer ${this.token}`,
            realm: 'dce.wnba',
            'x-api-key': API_KEY,
            'x-app-var': APP_VAR,
          },
        },
      );

      if (data && data.authorisationToken) {
        this.token = data.authorisationToken;

        await this.save();
      }
    } catch (e) {}
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'wnba'});

    if (!enabled) {
      return;
    }

    console.log('Looking for WNBA events...');

    await this.refreshTokens();

    const entries: IWNBAEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = ['https://', 'cdn.wnba.com', '/static/json/staticData/scheduleLeagueV2_1.json'].join('');

      const {data} = await axios.get<IWNBASchedule>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
      });

      debug.saveRequestData(data, 'wnba', 'epg');

      data.leagueSchedule.gameDates.forEach(e =>
        e.games.forEach(g => {
          const eventStart = moment.utc(g.gameDateTimeUTC);

          if (eventStart.isBefore(endSchedule) && moment(eventStart).add(3, 'hours').isAfter(now)) {
            entries.push(g);
          }
        }),
      );
    } catch (e) {
      console.error(e);
      console.log('Could not parse WNBA events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const parsedEventId = eventId.split('-')[1];

    await this.refreshTokens();

    try {
      const eventData = await getEventData(parsedEventId);

      const {data: streamData} = await axios.get<IWNBAStreamCallback>(eventData.playerUrlCallback);

      const hlsStream = streamData?.hls?.find(a => a.url);

      return [hlsStream.url, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public login = async (username?: string, password?: string): Promise<boolean> => {
    try {
      const url = [BASE_API_URL, '/v2/login'].join('');

      const {meta} = await db.providers.findOneAsync<IProvider<TWNBATokens, IWNBAMeta>>({name: 'wnba'});

      const {data} = await axios.post(
        url,
        {
          id: username || meta.username,
          secret: password || meta.password,
        },
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            realm: 'dce.wnba',
            'user-agent': okHttpUserAgent,
            'x-api-key': API_KEY,
            'x-app-var': APP_VAR,
          },
        },
      );

      this.token = data.authorisationToken;
      this.refresh_token = data.refreshToken;

      await this.save();

      return true;
    } catch (e) {
      console.error(e);
      console.log('Could not login to WNBA League Pass');

      return false;
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'wnba'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TWNBATokens>>({name: 'wnba'});
    const {refresh_token, token} = tokens || {};

    this.token = token;
    this.refresh_token = refresh_token;
  };
}

export type TWNBATokens = ClassTypeWithoutMethods<WNBAHandler>;

export const wnbaHandler = new WNBAHandler();
