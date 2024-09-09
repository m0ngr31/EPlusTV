import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';
import crypto from 'crypto';

import {configPath} from './config';
import {useParamountPlus} from './networks';
import {getRandomHex} from './shared-helpers';
import {db} from './database';
import {IEntry, IHeaders} from './shared-interfaces';

const BASE_THUMB_URL = 'https://wwwimage-us.pplusstatic.com/thumbnails/photos/w370-q80/';
const BASE_URL = 'https://www.paramountplus.com';
const TOKEN = [
  'A',
  'B',
  'C',
  '+',
  '2',
  'J',
  'j',
  'r',
  'O',
  'U',
  'Y',
  'W',
  'b',
  'a',
  'a',
  'q',
  'K',
  'm',
  'z',
  'w',
  'P',
  'd',
  'p',
  'p',
  'q',
  '0',
  'R',
  'D',
  'B',
  '2',
  'W',
  'd',
  'u',
  'f',
  'c',
  'F',
  'm',
  'I',
  's',
  'S',
  'n',
  'J',
  'D',
  'm',
  'D',
  'E',
  'Q',
  'p',
  'V',
  'g',
  'y',
  'A',
  'j',
  'Q',
  'p',
  'q',
  'p',
  'E',
  'D',
  'k',
  's',
  'K',
  'Z',
  'N',
  'M',
  'K',
  'Q',
  '=',
].join('');

const instance = axios.create({
  baseURL: BASE_URL,
});

interface IParamountUserProfile {
  id: number;
  isMasterProfile: boolean;
}

interface IParamountUser {
  activeProfile: IParamountUserProfile;
  accountProfiles: IParamountUserProfile[];
}

interface IParamountEvent {
  videoContentId: string;
  startTimestamp: number;
  endTimestamp: number;
  channelName: string;
  title: string;
  filePathThumb: string;
}

interface IDma {
  dma: string;
  tokenDetails: {
    syncBackToken: string;
    playback_url: string;
  };
}

interface IChannel {
  id: number;
  slug: string;
  channelName: string;
  local: boolean;
}

const ALLOWED_LOCAL_SPORTS = ['College Basketball', 'College Football', 'NFL Football', 'Super Bowl LVIII'];

const parseAirings = async (events: IParamountEvent[]) => {
  const now = moment();
  const inTwoDays = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: `${event.videoContentId}`});

    if (!entryExists) {
      const start = moment(event.startTimestamp);
      const end = moment(event.endTimestamp).add(1, 'hour');

      if (end.isBefore(now) || start.isAfter(inTwoDays)) {
        continue;
      }

      const categories = ['CBS Sports', 'Paramount+', event.channelName];

      console.log('Adding event: ', event.title);

      await db.entries.insert<IEntry>({
        categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'paramount+',
        id: event.videoContentId,
        image: `${BASE_THUMB_URL}${event.filePathThumb?.replace('files/', '')}`,
        name: event.title,
        network: 'Paramount+',
        sport: event.channelName,
        start: start.valueOf(),
      });
    }
  }
};

let isParamountDisabled = false;

class ParamountHandler {
  public device_id?: string;
  public hashed_token?: string;
  public cookies?: string[];
  public expires?: number;
  public profileId?: number;

  private appConfig: any;
  private ip: string;
  private dma: IDma;

  public initialize = async () => {
    if (!useParamountPlus || isParamountDisabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id || !this.hashed_token) {
      this.device_id = _.take(getRandomHex(), 16).join('');
      this.hashed_token = crypto
        .createHmac('sha1', 'eplustv')
        .update(this.device_id)
        .digest()
        .toString('base64')
        .substring(0, 16);

      this.save();
    }

    if (!this.cookies || !this.expires || moment().valueOf() >= this.expires) {
      await this.startProviderAuthFlow();
    }

    if (!this.profileId) {
      await this.getUserProfile();
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }
  };

  public refreshTokens = async () => {
    if (!useParamountPlus || isParamountDisabled) {
      return;
    }

    if (moment().valueOf() > moment(this.expires).subtract(1, 'month').valueOf()) {
      await this.getNewTokens();
    }
  };

  public getSchedule = async () => {
    if (!useParamountPlus || isParamountDisabled) {
      return;
    }

    console.log('Looking for Paramount+ events...');

    const events: IParamountEvent[] = [];

    try {
      const {data} = await instance.get<{listings: IParamountEvent[]}>(
        `/apps-api/v3.0/androidtv/hub/multi-channel-collection/live-and-upcoming.json?${new URLSearchParams({
          at: TOKEN,
          locale: 'en-us',
          platformType: 'androidtv',
          rows: '300',
          start: '0',
        })}`,
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      data.listings.forEach(e => events.push(e));

      const channels = await this.getLiveChannels();

      for (const c of channels) {
        try {
          const {data} = await instance.get(
            `/apps-api/v3.0/androidphone/live/channels/${c.slug}/listings.json?${new URLSearchParams({
              _clientRegion: this.appConfig.country,
              at: TOKEN,
              locale: 'en-us',
              rows: '125',
              showListing: 'true',
              start: '0',
            })}`,
            {
              headers: {
                Cookie: this.cookies,
              },
            },
          );

          (data.listing || []).forEach(e => {
            if (ALLOWED_LOCAL_SPORTS.includes(e.title)) {
              const transformedEvent: IParamountEvent = {
                channelName: e.title,
                endTimestamp: e.endTimestamp,
                filePathThumb: e.filePathThumb,
                startTimestamp: e.startTimestamp,
                title: e.episodeTitle || e.title,
                videoContentId: e.videoContentId.startsWith('_')
                  ? `${e.endTimestamp}----${e.videoContentId}`
                  : e.videoContentId,
              };

              events.push(transformedEvent);
            }
          });
        } catch (e) {
          console.error(e);
          console.log('Could not get EPG for: ', c.channelName);
        }
      }
    } catch (e) {
      console.error(e);
      console.log('Could not find events for Paramount+');
    }

    await parseAirings(events);
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
    try {
      const data = await this.getSteamData(eventId);

      if (!data) {
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
      }

      return [
        data.streamingUrl,
        {
          ...(data.ls_session && {
            Authorization: `Bearer ${data.ls_session}`,
          }),
        },
      ];
    } catch (e) {
      console.error(e);
      console.log('Could not get stream information!');
    }
  };

  private getSteamData = async (id: string): Promise<{streamingUrl: string; ls_session?: string}> => {
    try {
      // Local channel stream
      if (id.indexOf('----') > -1) {
        await this.getDma();

        return {
          streamingUrl: this.dma.tokenDetails.playback_url,
        };
      } else {
        const {data} = await instance.get(
          `/apps-api/v3.1/androidphone/irdeto-control/session-token.json?${new URLSearchParams({
            at: TOKEN,
            contentId: id,
            locale: 'en-us',
          })}`,
          {
            headers: {
              Cookie: this.cookies,
            },
          },
        );

        if (!data || !data.streamingUrl || !data.ls_session) {
          throw new Error('Could not get stream data');
        }

        return data;
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get stream data');
    }
  };

  private getLiveChannels = async (): Promise<IChannel[]> => {
    if (!this.dma) {
      await this.getDma();
    }

    try {
      const {data} = await instance.get<{carousel: IChannel[]}>(
        `/apps-api/v3.0/androidphone/home/configurator/channels.json?${new URLSearchParams({
          _clientRegion: this.appConfig.country_code,
          at: TOKEN,
          dma: this.dma?.dma,
          locale: 'en-us',
          rows: '100',
          showListing: 'true',
          start: '0',
        })}`,
      );

      const channels: IChannel[] = [];

      data.carousel.forEach(c => {
        if (c.local) {
          channels.push(c);
        }
      });

      return channels;
    } catch (e) {
      console.error(e);
      console.log('Could not get channel list for Paramount+');
    }
  };

  private getDma = async (): Promise<void> => {
    if (!this.ip) {
      await this.getIpAddress();
    }

    try {
      const {data} = await instance.get(
        `/apps-api/v3.0/androidphone/dma.json?${new URLSearchParams({
          at: TOKEN,
          did: this.device_id,
          dtp: '8',
          ipaddress: this.ip,
          is60FPS: 'true',
          locale: 'en-us',
          mvpdId: 'AllAccess',
          syncBackVersion: '3.0',
        })}`,
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      if (data && data.success && data.dmas && data.dmas[0]) {
        this.dma = data.dmas[0];
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get DMA information');
    }
  };

  private getIpAddress = async (): Promise<void> => {
    try {
      const {data} = await instance.get(
        `/apps/user/ip.json?${new URLSearchParams({
          at: TOKEN,
          locale: 'en-us',
        })}`,
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      this.ip = data.ip;
    } catch (e) {
      console.error(e);
      console.log('Could not get IP address');
    }
  };

  private getAppConfig = async (): Promise<void> => {
    try {
      const {data} = await instance.get(
        `/apps-api/v2.0/androidphone/app/status.json?${new URLSearchParams({
          at: TOKEN,
          locale: 'en-us',
        })}`,
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      if (!data || !data.appVersion || !data.appVersion.availableInRegion) {
        console.log('Paramount+ account not available in region - disabling P+ integration...');
        isParamountDisabled = true;
        return;
      }

      if (!data.appConfig) {
        isParamountDisabled = true;
        throw new Error('Getting app config failed');
      }

      if (data.appConfig.livetv_disabled) {
        isParamountDisabled = true;
        console.log('Paramount+ account does not have access to live TV - disabling P+ integration...');
        return;
      }

      this.appConfig = data.appConfig;
    } catch (e) {
      console.error(e);
      console.log('Could not get Paramount+ app config');
    }
  };

  private getNewTokens = async (): Promise<void> => {
    try {
      const {headers} = await instance.post(
        `/apps-api/v2.0/androidtv/user/account/profile/switch/${this.profileId}.json?${new URLSearchParams({
          at: TOKEN,
          locale: 'en-us',
        })}`,
        {},
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      this.saveCookies(headers['set-cookie']);
    } catch (e) {
      console.error(e);
      console.log('Could not refresh tokens for Paramount+!');
    }
  };

  private getUserProfile = async (): Promise<void> => {
    try {
      const user = await this.getUser();

      if (!user || !user.activeProfile || !user.activeProfile.id) {
        const masterProfile = _.find(user.accountProfiles, p => p.isMasterProfile);

        if (!masterProfile) {
          throw new Error('Could not parse out a master profile');
        }

        this.profileId = masterProfile.id;
      } else {
        this.profileId = user.activeProfile.id;
      }

      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get user profile!');
    }
  };

  private getUser = async (): Promise<IParamountUser> => {
    try {
      const {data} = await instance.get<IParamountUser>(
        `/apps-api/v3.0/androidtv/login/status.json?${new URLSearchParams({
          at: TOKEN,
          locale: 'en-us',
        })}`,
        {
          headers: {
            Cookie: this.cookies,
          },
        },
      );

      return data;
    } catch (e) {
      console.error(e);
      console.log('Could not get Paramount+ user!');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const {data} = await instance.post(
        `/apps-api/v2.0/androidtv/ott/auth/code.json?${new URLSearchParams({
          at: TOKEN,
          deviceId: this.hashed_token,
        }).toString()}`,
      );

      console.log('=== TV Provider Auth ===');
      console.log('Please open a browser window and go to: https://www.paramountplus.com/activate/androidtv');
      console.log('Enter code: ', data.activationCode);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode(data.activationCode, data.deviceToken);
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
      console.log('Could not start the authentication process for Paramount+!');
    }
  };

  private authenticateRegCode = async (activationCode: string, deviceToken: string): Promise<boolean> => {
    const regUrl = [
      '/apps-api/v2.0/androidtv/ott/auth/status.json?',
      new URLSearchParams({
        activationCode,
        at: TOKEN,
        deviceId: this.hashed_token,
        deviceToken,
      }).toString(),
    ].join('');

    try {
      const {data, headers} = await instance.post(regUrl);

      if (!data.success) {
        return false;
      }

      this.saveCookies(headers['set-cookie']);

      return true;
    } catch (e) {
      return false;
    }
  };

  private saveCookies = (cookies: string[]) => {
    this.cookies = cookies;
    this.expires = moment().add(1, 'year').valueOf();
    this.save();
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'paramount_tokens.json'), _.omit(this, 'appConfig', 'ip', 'dma'), {
      spaces: 2,
    });
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'paramount_tokens.json'))) {
      const {device_id, hashed_token, cookies, expires, profileId} = fsExtra.readJSONSync(
        path.join(configPath, 'paramount_tokens.json'),
      );

      this.device_id = device_id;
      this.hashed_token = hashed_token;
      this.cookies = cookies;
      this.expires = expires;
      this.profileId = profileId;
    }
  };
}

export const paramountHandler = new ParamountHandler();
