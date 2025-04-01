import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {userAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {normalTimeRange} from './shared-helpers';
import {debug} from './debug';
import {usesLinear} from './misc-db-service';

interface INswlLinearRes {
  channels: {
    name: string;
    programmes: INwslLinearEvent[];
  }[];
}

interface INwslLinearEvent {
  id: number;
  startDate: string;
  endDate: string;
  thumbnailUrl: string;
  episode: string;
}

interface INwslHomeRes {
  buckets: {
    type: string;
    contentList: INwslEvent[];
  }[];
}

interface INwslEvent {
  id: number;
  startDate: number;
  endDate: number;
  thumbnailUrl: string;
  title: string;
}

interface INwslMeta {
  username: string;
  password: string;
}

const BASE_API_URL = 'https://dce-frontoffice.imggaming.com/api';

const REFERRER = 'https://plus.nwslsoccer.com/';
const REALM = 'dce.nwsl';

const API_KEY = [
  '8',
  '5',
  '7',
  'a',
  '1',
  'e',
  '5',
  'd',
  '-',
  'e',
  '3',
  '5',
  'e',
  '-',
  '4',
  'f',
  'd',
  'f',
  '-',
  '8',
  '0',
  '5',
  'b',
  '-',
  'a',
  '8',
  '7',
  'b',
  '6',
  'f',
  '8',
  '3',
  '6',
  '4',
  'b',
  'f',
].join('');

const APP_VAR = '6.57.11.b0bf548';

const parseAirings = async (events: (INwslLinearEvent | INwslEvent)[], linear = false) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `nwsl-${event.id}`});

    if (!entryExists) {
      const start = moment(event.startDate);
      const end = moment(event.endDate);
      const originalEnd = moment(event.endDate);

      if (!linear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log(
        'Adding event: ',
        (event as INwslEvent).title ? (event as INwslEvent).title : (event as INwslLinearEvent).episode,
      );

      await db.entries.insertAsync<IEntry>({
        categories: ['Soccer', 'NWSL', 'NWSL+', "Woman's Soccer", "Women's Sports"],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'nwsl',
        id: `nwsl-${event.id}`,
        image: event.thumbnailUrl,
        name: (event as INwslEvent).title ? (event as INwslEvent).title : (event as INwslLinearEvent).episode,
        network: 'NWSL+',
        originalEnd: originalEnd.valueOf(),
        sport: "Woman's Soccer",
        start: start.valueOf(),
        ...(linear && {
          channel: 'NWSL+',
          linear: true,
        }),
      });
    }
  }
};

class NwslHandler {
  public token?: string;
  public tokenExp?: number;
  public refreshToken?: string;
  public refreshTokenExp?: number;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'nwsl'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const useLinear = await usesLinear();

      const data: TNwslTokens = {};

      await db.providers.insertAsync<IProvider<TNwslTokens>>({
        enabled: false,
        linear_channels: [
          {
            enabled: useLinear,
            id: 'NWSL+',
            name: 'NWSL+ 24/7',
          },
        ],
        name: 'nwsl',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nwsl'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nwsl'});

    if (!enabled) {
      return;
    }

    if (!this.refreshTokenExp || moment().isAfter(this.refreshTokenExp)) {
      await this.login();
    }

    if (moment().isBefore(this.tokenExp)) {
      return;
    }

    try {
      const url = [BASE_API_URL, '/v2/token/refresh'].join('');

      const {data} = await axios.post(
        url,
        {
          refreshToken: this.refreshToken,
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Realm: REALM,
            Referer: REFERRER,
            'User-Agent': userAgent,
            'x-api-key': API_KEY,
            'x-app-var': APP_VAR,
          },
        },
      );

      this.token = data.authorisationToken;

      const {exp: tokenExp}: {exp: number} = jwt_decode(this.token);
      this.tokenExp = tokenExp * 1000;

      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not renew tokens for NWSL+');
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled, linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'nwsl'});

    if (!enabled) {
      return;
    }

    await this.refreshTokens();

    console.log('Looking for NWSL+ events...');

    const entries: INwslEvent[] = [];
    const linearEntries: INwslLinearEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = [
        BASE_API_URL,
        '/v4/content/home',
        '?bpp=10',
        '&rpp=12',
        '&displaySectionLinkBuckets=SHOW',
        '&displayEpgBuckets=HIDE',
        '&displayEmptyBucketShortcuts=SHOW',
        '&displayContentAvailableOnSignIn=SHOW',
        '&displayGeoblocked=SHOW',
        '&bspp=20',
        '&premiereEventContentDisplay=SHOW',
      ].join('');

      const {data} = await axios.get<INwslHomeRes>(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Realm: REALM,
          Referer: REFERRER,
          'User-Agent': userAgent,
          'x-api-key': API_KEY,
          'x-app-var': APP_VAR,
        },
      });

      debug.saveRequestData(data, 'nwsl', 'epg');

      data.buckets.forEach(e => {
        if (e.type === 'UPCOMING') {
          e.contentList.forEach(a => entries.push(a));
        }
      });

      const useLinear = await usesLinear();

      if (useLinear && linear_channels[0].enabled) {
        const linearUrl = [
          BASE_API_URL,
          '/v4/epg',
          '?from=',
          now.toISOString(),
          '&to=',
          endSchedule.toISOString(),
          '&rpp=20',
          '&channel=1140',
        ].join('');

        const {data: linearData} = await axios.get<INswlLinearRes>(linearUrl, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Realm: REALM,
            Referer: REFERRER,
            'User-Agent': userAgent,
            'x-api-key': API_KEY,
            'x-app-var': APP_VAR,
          },
        });

        debug.saveRequestData(data, 'nwsl', 'epg-linear');

        linearData.channels.forEach(c => {
          if (c.name === 'NWSL+ 24/7') {
            c.programmes.forEach(e => linearEntries.push(e));
          }
        });
      }
    } catch (e) {
      console.error(e);
      console.log('Could not parse NWSL+ Sports events');
    }

    await parseAirings(entries);
    await parseAirings(linearEntries, true);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    await this.refreshTokens();

    const event = await db.entries.findOneAsync<IEntry>({id: eventId});

    let eventRealId = '275408';

    if (!event.linear) {
      eventRealId = eventId.split('nwsl-')[1];
    }

    const url = [
      BASE_API_URL,
      '/v4/event/',
      eventRealId,
      '?includePlaybackDetails=URL',
      '&displayGeoblocked=SHOW',
    ].join('');

    try {
      const {data: initialData} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Realm: REALM,
          Referer: REFERRER,
          'User-Agent': userAgent,
          'x-api-key': API_KEY,
          'x-app-var': APP_VAR,
        },
      });

      const {playerUrlCallback} = initialData;

      const {data: playbackData} = await axios.get(playerUrlCallback, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
      });

      return [playbackData.hlsUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public login = async (username?: string, password?: string): Promise<boolean> => {
    const url = [BASE_API_URL, '/v2/login'].join('');

    const authToken = await this.getBaseAuthToken();

    try {
      const {meta} = await db.providers.findOneAsync<IProvider<any, INwslMeta>>({name: 'nwsl'});

      const params = {
        id: username || meta.username,
        secret: password || meta.password,
      };

      const {data} = await axios.post(url, params, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Realm: REALM,
          Referer: REFERRER,
          'User-Agent': userAgent,
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': API_KEY,
          'x-app-var': APP_VAR,
        },
      });

      this.token = data.authorisationToken;
      this.refreshToken = data.refreshToken;

      const {exp: tokenExp}: {exp: number} = jwt_decode(this.token);
      const {exp: refreshExp}: {exp: number} = jwt_decode(this.refreshToken);

      this.tokenExp = tokenExp * 1000;
      this.refreshTokenExp = refreshExp * 1000;

      await this.save();

      return true;
    } catch (e) {
      console.error(e);
      console.log('Could not login to NWSL+');

      return false;
    }
  };

  private getBaseAuthToken = async (): Promise<string> => {
    const url = [
      BASE_API_URL,
      '/v1/init/',
      '?lk=language',
      '&pk=subTitleLanguage',
      '&pk=audioLanguage',
      '&pk=autoAdvance',
      '&pk=pluginAccessTokens',
      '&pk=videoBackgroundAutoPlay',
      '&readLicences=true',
      '&countEvents=LIVE',
      '&menuTargetPlatform=WEB',
    ].join('');

    try {
      const {data} = await axios.get(url, {
        headers: {
          Referer: REFERRER,
          'User-Agent': userAgent,
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': API_KEY,
          'x-app-var': APP_VAR,
        },
      });

      console.log(data);

      return data.authentication.authorisationToken;
    } catch (e) {
      console.error(e);
      console.log('Could not get init auth token for NWSL+');
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'nwsl'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TNwslTokens>>({name: 'nwsl'});
    const {refreshToken, refreshTokenExp, token, tokenExp} = tokens || {};

    this.token = token;
    this.tokenExp = tokenExp;
    this.refreshToken = refreshToken;
    this.refreshTokenExp = refreshTokenExp;
  };
}

export type TNwslTokens = ClassTypeWithoutMethods<NwslHandler>;

export const nwslHandler = new NwslHandler();
