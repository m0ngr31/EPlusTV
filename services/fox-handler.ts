import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';

import {androidFoxUserAgent, userAgent} from './user-agent';
import {configPath} from './init-directories';
import {useFoxSports} from './networks';
import {IAdobeAuthFox, isAdobeFoxTokenValid} from './adobe-helpers';
import {getRandomHex} from './shared-helpers';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';

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
  accessToken: string;
  tokenExpiration: number;
  viewerId: string;
  deviceId: string;
  profileId: string;
}

interface IFoxEvent {
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
  streamTypes: string[];
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

const parseCategories = (event: IFoxEvent) => {
  const categories = ['Sports', 'FOX Sports'];
  for (const classifier of [...(event.categoryTags || []), ...(event.genres || [])]) {
    if (classifier !== null) {
      categories.push(classifier);
    }
  }

  if (event.streamTypes.find(resolution => resolution === 'HDR' || resolution === 'SDR')) {
    categories.push('4K');
  }

  return [...new Set(categories)];
};

const parseAirings = async (events: IFoxEvent[]) => {
  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.id});

    if (!entryExists) {
      console.log('Adding event: ', event.name);

      await db.entries.insert<IEntry>({
        categories: parseCategories(event),
        duration: moment(event.endDate).diff(moment(event.startDate), 'seconds'),
        end: new Date(event.endDate).valueOf(),
        from: 'foxsports',
        id: event.id,
        image: event.images.logo?.FHD || event.images.seriesDetail?.FHD,
        name: event.name,
        network: event.callSign,
        start: new Date(event.startDate).valueOf(),
      });
    }
  }
};

const allowReplays = process.env.FOXSPORTS_ALLOW_REPLAYS;
const maxRes = getMaxRes();

const FOX_APP_CONFIG = 'https://config.foxdcg.com/foxsports/androidtv-native/3.42/info.json';

// Will prelim token expire in the next month?
const willPrelimTokenExpire = (token: IAdobePrelimAuthToken): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 * 30 > token.tokenExpiration;
// Will auth token expire in the next day?
const willAuthTokenExpire = (token: IAdobeAuthFox): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 > token.tokenExpiration;

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

    if (!this.adobe_prelim_auth_token || !this.adobe_prelim_auth_token?.accessToken) {
      await this.getPrelimToken();
    }

    if (!isAdobeFoxTokenValid(this.adobe_auth)) {
      await this.startProviderAuthFlow();
    }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (FOX Sports)');
      await this.authenticateRegCode();
    }

    await this.getEntitlements();
  };

  public refreshTokens = async () => {
    if (!useFoxSports) {
      return;
    }

    if (willPrelimTokenExpire(this.adobe_prelim_auth_token)) {
      console.log('Updating FOX Sports prelim token');
      await this.getPrelimToken();
    }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (FOX Sports)');
      await this.authenticateRegCode();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useFoxSports) {
      return;
    }

    console.log('Looking for FOX Sports events...');

    const entries = await this.getEvents();

    try {
      await parseAirings(entries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse FOX Sports events');
    }
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
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
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
      }

      const {data: streamData} = await axios.get(data.url, {
        headers: {
          'User-Agent': androidFoxUserAgent,
          'x-api-key': this.appConfig.api.key,
        },
      });

      if (!streamData.playURL) {
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
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

  private getEvents = async (): Promise<IFoxEvent[]> => {
    const events: IFoxEvent[] = [];

    const now = new Date();

    const dateRange = `${now.toISOString()}..${moment(now).add(2, 'days').toISOString}`;

    try {
      const {data} = await axios.get<IFoxEventsData>(
        encodeURI(`https://api3.fox.com/v2.0/screens/live?dateRange=${dateRange}`),
        {
          headers: {
            'User-Agent': userAgent,
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      _.forEach(data.panels.member, member => {
        _.forEach(member.items.member, m => {
          if (
            _.some(this.entitlements, network => network === getEventNetwork(m)) &&
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
      const {data} = await axios.post<IAdobePrelimAuthToken>(
        this.appConfig.api.profile.login,
        {
          deviceId: this.adobe_device_id,
        },
        {
          headers: {
            'User-Agent': androidFoxUserAgent,
            'x-api-key': this.appConfig.api.key,
            'x-signature-enabled': true,
          },
        },
      );

      this.adobe_prelim_auth_token = data;
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
            authorization: `Bearer ${this.adobe_prelim_auth_token.accessToken}`,
            'x-api-key': this.appConfig.api.key,
          },
        },
      );

      console.log('== TV Provider Auth ==');
      console.log('Please open a browser window and go to: https://go.foxsports.com');
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

  private authenticateRegCode = async (showAuthnError = true): Promise<boolean> => {
    try {
      const {data} = await axios.get(`${this.appConfig.api.auth.checkadobeauthn}?device_id=${this.adobe_device_id}`, {
        headers: {
          'User-Agent': androidFoxUserAgent,
          authorization: !this.adobe_auth?.accessToken
            ? `Bearer ${this.adobe_prelim_auth_token.accessToken}`
            : this.adobe_auth.accessToken,
          'x-api-key': this.appConfig.api.key,
          'x-signature-enabled': true,
        },
      });

      this.adobe_auth = data;
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

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'fox_tokens.json'), _.omit(this, 'appConfig', 'entitlements'), {
      spaces: 2,
    });
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'fox_tokens.json'))) {
      const {adobe_device_id, adobe_auth, adobe_prelim_auth_token} = fsExtra.readJSONSync(
        path.join(configPath, 'fox_tokens.json'),
      );

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
      this.adobe_prelim_auth_token = adobe_prelim_auth_token;
    }
  };
}

export const foxHandler = new FoxHandler();
