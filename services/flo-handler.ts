import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';

import {flowSportsUserAgent} from './user-agent';
import {configPath} from './config';
import {useFloSports} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';

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

  for (const event of events) {
    for (const stream of event.live_event_metadata.streams) {
      const entryExists = await db.entries.findOne<IEntry>({id: `flo-${stream.stream_id}`});

      if (!entryExists) {
        const start = moment(event.label_1_parts.start_date_time);
        const end = moment(event.label_1_parts.start_date_time).add(4, 'hours');

        if (end.isBefore(now)) {
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

class FloSportsHandler {
  public access_token?: string;
  public refresh_token?: string;
  public expires_at?: number;
  public refresh_expires_at?: number;
  public device_id?: string;

  public initialize = async () => {
    if (!useFloSports) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = getRandomUUID();
      this.save();
    }

    if (!this.expires_at || !this.access_token) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useFloSports) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(10, 'days'))) {
      await this.extendToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useFloSports) {
      return;
    }

    console.log('Looking for FloSports events (this can take a while)...');

    try {
      let hasNextPage = true;
      let page = 1;
      const events: IFloEvent[] = [];
      const limit = 100;

      const endSchedule = moment().add(2, 'days');

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
        });

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

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
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
            'User-Agent': flowSportsUserAgent,
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
            'User-Agent': flowSportsUserAgent,
          },
        },
      );

      this.access_token = data.token;
      this.expires_at = data.exp * 1000;
      this.refresh_token = data.refresh_token;
      this.refresh_expires_at = data.refresh_token_exp * 1000;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not extend token for FloSports');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const url = ['https://', 'api.flosports.tv', '/api', '/activation-codes', '/new'].join('');

      const {data} = await axios.post(
        url,
        {},
        {
          headers: {
            'User-Agent': flowSportsUserAgent,
          },
        },
      );

      const code = data.activation_code;

      console.log('=== FloSports Auth ===');
      console.log('Please open a browser window and go to: https://www.flolive.tv/activate');
      console.log('Enter code: ', code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode(code);
            numOfReqs += 1;

            if (res) {
              clearInterval(regInterval);
              resolve();
            }
          } else {
            clearInterval(regInterval);
            reject();
          }
        };

        const regInterval = setInterval(() => {
          authenticate();
        }, 10 * 1000);

        await authenticate();
      });
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for Fox Sports!');
    }
  };

  private authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = ['https://', 'api.flosports.tv', '/api', '/activation-codes/', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': flowSportsUserAgent,
        },
      });

      if (!data) {
        return false;
      }

      this.access_token = data.token;
      this.expires_at = data.exp * 1000;
      this.refresh_token = data.refresh_token;
      this.refresh_expires_at = data.refresh_token_exp * 1000;
      this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'flo_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'flo_tokens.json'))) {
      const {device_id, access_token, expires_at, refresh_token, refresh_expires_at} = fsExtra.readJSONSync(
        path.join(configPath, 'flo_tokens.json'),
      );

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
      this.refresh_expires_at = refresh_expires_at;
    }
  };
}

export const floSportsHandler = new FloSportsHandler();
