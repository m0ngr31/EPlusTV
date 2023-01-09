import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';

import {androidFoxUserAgent, userAgent} from './user-agent';
import {configPath} from './init-directories';
import {useFoxSports} from './networks';
import {
  createAdobeAuthHeader,
  IAdobeAuthFox,
  isAdobeFoxTokenValid,
} from './adobe-helpers';
import {getRandomHex} from './shared-helpers';
import moment from 'moment';
import {IHeaders} from './shared-interfaces';

const getMaxRes = _.memoize(() => {
  switch (process.env.MAX_RESOLUTION) {
    case 'UHD/HDR':
      return 'UHD/HDR';
    case '720p':
      return '720p';
    default:
      return 'UHD/SDR';
  }
});

const allowReplays = process.env.FOXSPORTS_ALLOW_REPLAYS;
const maxRes = getMaxRes();

const ADOBE_KEY = [
  'g',
  'B',
  '8',
  'H',
  'Y',
  'd',
  'E',
  'P',
  'y',
  'e',
  'z',
  'e',
  'Y',
  'b',
  'R',
  '1',
].join('');

const ADOBE_PUBLIC_KEY = [
  'y',
  'K',
  'p',
  's',
  'H',
  'Y',
  'd',
  '8',
  'T',
  'O',
  'I',
  'T',
  'd',
  'T',
  'M',
  'J',
  'H',
  'm',
  'k',
  'J',
  'O',
  'V',
  'm',
  'g',
  'b',
  'b',
  '2',
  'D',
  'y',
  'k',
  'N',
  'K',
].join('');

interface IAppConfig {
  api: {
    content: {
      watch: string;
    };
    key: string;
    auth: {
      accountRegCode: string;
      checkadobeauthn: string;
      getentitlements: string;
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
  seriesType: string;
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
  contentSKUResolved?: {
    baseId: string;
  }[];
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

// Will tokens expire in the next hour?
const willPrelimTokenExpire = (token: IAdobePrelimAuthToken): boolean =>
  new Date().valueOf() + 3600 * 1000 > token.exp;
const willAuthTokenExpire = (token: IAdobeAuthFox): boolean =>
  new Date().valueOf() + 3600 * 1000 > token.tokenExpiration;

const getEventNetwork = (event: IFoxEvent): string => {
  if (event.contentSKUResolved && event.contentSKUResolved[0]) {
    return event.contentSKUResolved[0].baseId.split('.')[1];
  }

  return 'not-entitled';
};

class FoxHandler {
  public adobe_device_id?: string;
  public adobe_prelim_auth_token?: IAdobePrelimAuthToken;
  public adobe_auth?: IAdobeAuthFox;

  private entitlements: string[] = [];
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

    // if (!isAdobeFoxTokenValid(this.adobe_auth)) {
    // await this.startProviderAuthFlow();
    // }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Updating FOX Sports auth code');
      await this.authenticateRegCode();
      await this.refreshProviderToken();
    }

    await this.getEntitlements();
  };

  public refreshTokens = async () => {
    if (!useFoxSports) {
      return;
    }

    if (!isAdobeFoxTokenValid(this.adobe_auth)) {
      console.log('FOX Sports token has expired. Please login again');
      process.exit(1);
    }

    if (willPrelimTokenExpire(this.adobe_prelim_auth_token)) {
      // It has been 2 years, time to get a new code
      console.log('Updating FOX Sports prelim token');
      await this.getPrelimToken();
    }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Updating FOX Sports auth code');
      await this.authenticateRegCode();
      await this.refreshProviderToken();
    }
  };

  public getEvents = async () => {
    const events = [];

    const now = new Date();

    const dateRange = `${now.toISOString()}..${
      moment(now).add(2, 'days').toISOString
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
              this.entitlements,
              network => network === getEventNetwork(m),
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
    } catch (e) {
      console.log(e);
    }

    return events;
  };

  public getEventData = async (
    eventId: string,
  ): Promise<[string, IHeaders]> => {
    try {
      const {data} = await axios.post(
        this.appConfig.api.content.watch,
        {
          deviceHeight: 2160,
          deviceWidth: 3840,
          maxRes,
          os: 'Android',
          osv: '11.0.0',
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

      // console.log('CDN: ', data.trackingData.properties.CDN);

      if (!data.url) {
        throw new Error(
          'Could not get stream data. Event might be upcoming, ended, or in blackout...',
        );
      }

      const {data: streamData} = await axios.get(data.url, {
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

      return [
        streamData.playURL,
        {
          'User-Agent': androidFoxUserAgent,
        },
      ];
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

  private getEntitlements = async (): Promise<void> => {
    try {
      const {data} = await axios.get<any>(
        `${this.appConfig.api.auth.getentitlements}?device_type=&device_id=${this.adobe_device_id}&resource=&requestor=`,
        {
          headers: {
            'User-Agent': androidFoxUserAgent,
            authorization: this.adobe_auth.accessToken,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      this.entitlements = [];

      _.forOwn(data.entitlements, (_val, key) => {
        if (/^[a-z]/.test(key) && key !== 'foxdep') {
          this.entitlements.push(key);
        }
      });
    } catch (e) {
      console.error(e);
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
            const res = await this.authenticateRegCode(false);
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

  private authenticateRegCode = async (
    showAuthnError = true,
  ): Promise<boolean> => {
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

      this.adobe_auth = {
        ...data,
        tokenExpiration: Math.min(
          parseInt(moment().add(1, 'day').format('x'), 10),
          data.tokenExpiration,
        ),
      };
      this.save();

      return true;
    } catch (e) {
      if (e.response?.status !== 404) {
        if (showAuthnError) {
          if (e.response?.status === 410) {
            console.error(e);
            console.log('Adobe AuthN token has expired for FOX Sports');
          }
        } else if (e.response?.status !== 410) {
          console.error(e);
          console.log('Could not get provider token data for Fox Sports!');
        }
      }

      return false;
    }
  };

  private async refreshProviderToken() {
    const renewUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1/',
      'tokens/authn',
      '?requestor=fbc-fox',
      `&deviceId=${this.adobe_device_id}`,
    ].join('');

    try {
      const {data} = await axios.get(renewUrl, {
        headers: {
          Authorization: createAdobeAuthHeader(
            'GET',
            renewUrl,
            ADOBE_KEY,
            ADOBE_PUBLIC_KEY,
            'fbc-fox',
          ),
          'User-Agent': userAgent,
        },
      });

      this.adobe_auth.authn_expire = parseInt(data.expires, 10);
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh provider token data!');
    }
  }

  private save = () => {
    fsExtra.writeJSONSync(
      path.join(configPath, 'fox_tokens.json'),
      _.omit(this, 'appConfig', 'entitlements'),
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
