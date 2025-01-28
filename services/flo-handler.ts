import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';

import {floSportsUserAgent} from './user-agent';
import {configPath} from './config';
import {useFloSports} from './networks';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';
import {debug} from './debug';

interface IFloEventsRes {
  sections: {
    id: string;
    title: string;
    items: IFloEvent[];
  }[];
}

interface IFloEvent {
  id: string;
  title: string;
  footer_1: string;
  preview_image: {
    url: string;
  };
  label_1_parts: {
    status: string;
    start_date_time: string;
  };
  action: {
    node_id: number;
    analytics: {
      name: string;
      site_name: string;
    };
  };
  live_event_metadata: {
    live_event_id: number;
    streams: {
      stream_id: number;
      stream_name: string;
    }[];
  };
}

const parseAirings = async (events: IFloEvent[]) => {
  const now = moment();
  const endSchedule = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    for (const stream of event.live_event_metadata.streams) {
      const entryExists = await db.entries.findOne<IEntry>({id: `flo-${stream.stream_id}`});

      if (!entryExists) {
        const start = moment(event.label_1_parts.start_date_time);
        const end = moment(event.label_1_parts.start_date_time).add(4, 'hours');

        if (end.isBefore(now) || start.isAfter(endSchedule)) {
          continue;
        }

        const gameName = event.action.analytics?.name.replace(/^\d{4}\s+/, '');

        console.log('Adding event: ', gameName);

        await db.entries.insert<IEntry>({
          categories: [...new Set([event.footer_1, 'FloSports', event.action.analytics.site_name])],
          duration: end.diff(start, 'seconds'),
          end: end.valueOf(),
          from: 'flo',
          id: `flo-${stream.stream_id}`,
          image: event.preview_image.url,
          name: gameName,
          network: event.action.analytics.site_name,
          sport: event.footer_1,
          start: start.valueOf(),
        });
      }
    }
  }
};

const floSportsConfigPath = path.join(configPath, 'flo_tokens.json');

class FloSportsHandler {
  public access_token?: string;
  public refresh_token?: string;
  public expires_at?: number;
  public refresh_expires_at?: number;
  public device_id?: string;

  public initialize = async () => {
    const setup = (await db.providers.count({name: 'flosports'})) > 0 ? true : false;

    if (!setup) {
      const data: TFloSportsTokens = {};

      if (useFloSports) {
        this.loadJSON();

        data.access_token = this.access_token;
        data.expires_at = this.expires_at;
        data.device_id = this.device_id;
        data.refresh_token = this.refresh_token;
        data.refresh_expires_at = this.refresh_expires_at;
      }

      await db.providers.insert<IProvider<TFloSportsTokens>>({
        enabled: useFloSports,
        name: 'flosports',
        tokens: data,
      });

      if (fs.existsSync(floSportsConfigPath)) {
        fs.rmSync(floSportsConfigPath);
      }
    }

    if (useFloSports) {
      console.log('Using FLOSPORTS variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOne<IProvider<TFloSportsTokens>>({name: 'flosports'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOne<IProvider<TFloSportsTokens>>({name: 'flosports'});

    if (!enabled) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(10, 'days'))) {
      await this.extendToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOne<IProvider<TFloSportsTokens>>({name: 'flosports'});

    if (!enabled) {
      return;
    }

    console.log('Looking for FloSports events (this can take a while)...');

    try {
      let hasNextPage = true;
      let page = 1;
      const events: IFloEvent[] = [];
      const limit = 100;

      const endSchedule = moment().add(2, 'days').endOf('day');

      while (hasNextPage) {
        const url = [
          'https://api.flosports.tv/api/experiences/tv/events/live-and-upcoming?version=1.22.0&site_id=1%2C2%2C4%2C7%2C8%2C10%2C12%2C14%2C20%2C22%2C23%2C27%2C28%2C29%2C30%2C32%2C33%2C34%2C35%2C36%2C37%2C38%2C41%2C42%2C43',
          `&limit=${limit}`,
          page > 1 ? `&offset=${page * limit}` : '',
        ].join('');

        const {data} = await axios.get<IFloEventsRes>(url, {
          headers: {
            Authorization: `Bearer ${this.access_token}`,
          },
          // This request can take a long time so increasing the timeout
          timeout: 1000 * 60 * 5,
        });

        debug.saveRequestData(data, 'flosports', 'epg');

        data?.sections.forEach(e => {
          if (e.id === 'live-and-upcoming' || e.title === 'Live & Upcoming') {
            e.items.forEach(a => {
              if (a.action && a.label_1_parts && a.label_1_parts.status !== 'CONCLUDED' && !a.title.startsWith('TBA')) {
                if (moment(a.label_1_parts.start_date_time).isBefore(endSchedule)) {
                  events.push(a);
                } else {
                  hasNextPage = false;
                }
              }
            });
          }
        });

        page += 1;
      }

      await parseAirings(events);
    } catch (e) {
      console.error(e);
      console.log('Could not parse FloSports events');
    }
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const id = eventId.replace('flo-', '');

    try {
      await this.extendToken();

      const url = ['https://', 'live-api-3.flosports.tv', '/streams/', id, '/tokens'].join('');

      const {data} = await axios.post(
        url,
        {
          adTracking: {
            appName: 'flosports-androidtv',
            appStoreUrl: 'https://play.google.com/store/apps/details?id=tv.flosports&hl=en_US',
            appVersion: 'v2.11.0-2220530',
            casting: false,
            deviceModel: 'sdk_google_atv_x86',
            height: 1080,
            isLat: 0,
            os: 'android',
            osVersion: '28',
            rdid: this.device_id,
            width: 1920,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': floSportsUserAgent,
            authorization: `Bearer ${this.access_token}`,
          },
        },
      );

      return [data.data.uri, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private extendToken = async (): Promise<void> => {
    try {
      const url = ['https://', 'api.flosports.tv', '/api', '/refresh-tokens'].join('');

      const {data} = await axios.post(
        url,
        {
          token: this.refresh_token,
        },
        {
          headers: {
            'User-Agent': floSportsUserAgent,
          },
        },
      );

      this.access_token = data.token;
      this.expires_at = data.exp * 1000;
      this.refresh_token = data.refresh_token;
      this.refresh_expires_at = data.refresh_token_exp * 1000;
      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not extend token for FloSports');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.device_id = getRandomUUID();

    try {
      const url = ['https://', 'api.flosports.tv', '/api', '/activation-codes', '/new'].join('');

      const {data} = await axios.post(
        url,
        {},
        {
          headers: {
            'User-Agent': floSportsUserAgent,
          },
        },
      );

      return data.activation_code;
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for Fox Sports!');
    }
  };

  public authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = ['https://', 'api.flosports.tv', '/api', '/activation-codes/', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': floSportsUserAgent,
        },
      });

      if (!data) {
        return false;
      }

      this.access_token = data.token;
      this.expires_at = data.exp * 1000;
      this.refresh_token = data.refresh_token;
      this.refresh_expires_at = data.refresh_token_exp * 1000;
      await this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private save = async () => {
    await db.providers.update({name: 'flosports'}, {$set: {tokens: this}});
  };

  private load = async () => {
    const {tokens} = await db.providers.findOne<IProvider<TFloSportsTokens>>({name: 'flosports'});
    const {device_id, access_token, expires_at, refresh_token, refresh_expires_at} = tokens;

    this.device_id = device_id;
    this.access_token = access_token;
    this.expires_at = expires_at;
    this.refresh_token = refresh_token;
    this.refresh_expires_at = refresh_expires_at;
  };

  private loadJSON = () => {
    if (fs.existsSync(floSportsConfigPath)) {
      const {device_id, access_token, expires_at, refresh_token, refresh_expires_at} =
        fsExtra.readJSONSync(floSportsConfigPath);

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
      this.refresh_expires_at = refresh_expires_at;
    }
  };
}

export type TFloSportsTokens = ClassTypeWithoutMethods<FloSportsHandler>;

export const floSportsHandler = new FloSportsHandler();
