import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';

import {androidFoxUserAgent, userAgent} from './user-agent';
import {configPath} from './init-directories';
import {useFoxSports} from './networks';
import {IAdobeAuthFox, isAdobeFoxTokenValid} from './adobe-helpers';
import {getRandomHex} from './generate-random';
import moment from 'moment';

const allowReplays = process.env.FOXSPORTS_ALLOW_REPLAYS;

interface IAppConfig {
  api: {
    content: {
      watch: string;
    };
    key: string;
    auth: {
      accountRegCode: string;
      checkadobeauthn: string;
    };
    profile: {
      login: string;
    };
  };
  auth: {
    displayActivationUrl: string;
  };
}

interface IAdobePrelimAuthToken {
  token: string;
  exp: number;
}

export interface IFoxEvent {
  airingType: string;
  audioOnly: boolean;
  broadcastID: string;
  callSign: string;
  categoryTags: string[];
  id: string;
  genres: string[];
  name: string;
  longDescription: string;
  startDate: string;
  endDate: string;
  network: string;
  images: {
    logo?: {
      FHD: string;
    };
    seriesDetail?: {
      FHD: string;
    };
  };
}

interface IFoxEventsData {
  panels: {
    member?: {
      items: {
        member: IFoxEvent[];
      };
    }[];
  };
}

const FOX_APP_CONFIG =
  'https://config.foxdcg.com/foxsports/androidtv-native/3.42/info.json';

const WORKING_CDNS = ['limelight'];

// Will the token expire in the next hour?
const willPrelimTokenExpire = (token: IAdobePrelimAuthToken): boolean =>
  new Date().valueOf() + 3600 * 1000 > token.exp;

const FOX_NETWORKS = ['btn', 'fs1', 'fs2', 'fox-soccer-plus'];

class FoxHandler {
  public adobe_device_id?: string;
  public adobe_prelim_auth_token?: IAdobePrelimAuthToken;
  public adobe_auth?: IAdobeAuthFox;

  private appConfig: IAppConfig;

  public initialize = async () => {
    if (!useFoxSports) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.adobe_device_id) {
      this.adobe_device_id = _.take(getRandomHex(), 16).join('');
      this.save();
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    if (!this.adobe_prelim_auth_token) {
      await this.getPrelimToken();
    }

    if (!isAdobeFoxTokenValid(this.adobe_auth)) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useFoxSports) {
      return;
    }

    if (willPrelimTokenExpire(this.adobe_prelim_auth_token)) {
      // It has been 2 years, time to get a new code
      console.log(
        "You need to authorize Fox Sports again. Unfortunately there isn't a way to renew automatically. Please re-authorize!",
      );

      fsExtra.removeSync(path.join(configPath, 'fox_tokens.json'));

      process.exit(1);
    }
  };

  public getEvents = async () => {
    const events = [];

    const now = new Date();

    const dateRange = `${now.toISOString()}..${
      moment(now).add(12, 'hours').toISOString
    }`;

    try {
      const {data} = await axios.get<IFoxEventsData>(
        encodeURI(
          `https://api3.fox.com/v2.0/screens/live?dateRange=${dateRange}`,
        ),
        {
          headers: {
            'User-Agent': userAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.token}`,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      _.forEach(data.panels.member, member => {
        _.forEach(member.items.member, m => {
          if (
            _.some(
              FOX_NETWORKS,
              network => network === m.network.toLowerCase(),
            ) &&
            !m.audioOnly &&
            m.startDate &&
            m.endDate &&
            m.id
          ) {
            if (m.airingType === 'live') {
              events.push(m);
            } else if (allowReplays && m.airingType !== 'live') {
              events.push(m);
            }
          }
        });
      });
    } catch (e) {}

    return events;
  };

  public getEventData = async (eventId: string): Promise<[string, string]> => {
    try {
      let dataUrl;
      let cdnAttempt = 0;

      do {
        if (cdnAttempt > 15) {
          throw new Error(
            'Could not get stream data. Event might be upcoming, ended, or in blackout...',
          );
        }

        const {data} = await axios.post(
          this.appConfig.api.content.watch,
          {
            deviceHeight: 2160,
            deviceWidth: 3840,
            maxRes: '720p',
            os: 'Android',
            osv: '9.0.0',
            streamId: eventId,
            streamType: 'live',
          },
          {
            headers: {
              'User-Agent': androidFoxUserAgent,
              authorization: this.adobe_auth.accessToken,
              'x-api-key': this.appConfig.api.key,
            },
          },
        );

        if (!data.url) {
          throw new Error(
            'Could not get stream data. Event might be upcoming, ended, or in blackout...',
          );
        }

        if (
          _.some(WORKING_CDNS, cdn => cdn === data.trackingData.properties.CDN)
        ) {
          dataUrl = data.url;
        } else {
          cdnAttempt += 1;
        }
      } while (!dataUrl);

      const {data: streamData} = await axios.get(dataUrl, {
        headers: {
          'User-Agent': androidFoxUserAgent,
          'x-api-key': this.appConfig.api.key,
        },
      });

      if (!streamData.playURL) {
        throw new Error(
          'Could not get stream data. Event might be upcoming, ended, or in blackout...',
        );
      }

      return [streamData.playURL, ' '];
    } catch (e) {
      console.error(e);
      console.log('Could not get stream information!');
    }
  };

  private getAppConfig = async () => {
    try {
      const {data} = await axios.get<IAppConfig>(FOX_APP_CONFIG);
      this.appConfig = data;
    } catch (e) {
      console.error(e);
      console.log('Could not load API app config');
    }
  };

  private getPrelimToken = async (): Promise<void> => {
    try {
      const {data} = await axios.post(
        this.appConfig.api.profile.login,
        {
          deviceId: this.adobe_device_id,
          email: '',
          facebookToken: '',
          googleToken: '',
          password: '',
        },
        {
          headers: {
            'User-Agent': androidFoxUserAgent,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      this.adobe_prelim_auth_token = {
        exp: data.tokenExpiration,
        token: data.accessToken,
      };
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get information to start Fox Sports login flow');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const {data} = await axios.post(
        this.appConfig.api.auth.accountRegCode,
        {
          deviceID: this.adobe_device_id,
          isMvpd: true,
          selectedMvpdId: '',
        },
        {
          headers: {
            'User-Agent': androidFoxUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.token}`,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      console.log('== TV Provider Auth ==');
      console.log(
        'Please open a browser window and go to: https://go.foxsports.com',
      );
      console.log('Enter code: ', data.code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode();
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

  private authenticateRegCode = async (): Promise<boolean> => {
    try {
      const {data} = await axios.get(
        `${this.appConfig.api.auth.checkadobeauthn}?device_id=${this.adobe_device_id}`,
        {
          headers: {
            'User-Agent': androidFoxUserAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.token}`,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      this.adobe_auth = data;
      this.save();

      return true;
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error(e);
        console.log('Could not get provider token data for Fox Sports!');
      }

      return false;
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(
      path.join(configPath, 'fox_tokens.json'),
      _.omit(this, 'appConfig'),
      {spaces: 2},
    );
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'fox_tokens.json'))) {
      const {adobe_device_id, adobe_auth, adobe_prelim_auth_token} =
        fsExtra.readJSONSync(path.join(configPath, 'fox_tokens.json'));

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
      this.adobe_prelim_auth_token = adobe_prelim_auth_token;
    }
  };
}

export const foxHandler = new FoxHandler();
