import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';

import {androidFoxUserAgent, userAgent} from './user-agent';
import {configPath} from './config';
import {useFoxOnly4k, useFoxSports} from './networks';
import {IAdobeAuthFox} from './adobe-helpers';
import {getRandomHex, normalTimeRange} from './shared-helpers';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {usesLinear} from './misc-db-service';

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
  sportTag?: string;
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
    seriesList?: {
      FHD: string;
    };
  };
  isUHD: boolean;
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

interface IFoxMeta {
  only4k?: boolean;
  uhd?: boolean;
}

const foxConfigPath = path.join(configPath, 'fox_tokens.json');

const getMaxRes = (res: string) => {
  switch (res) {
    case 'UHD/HDR':
      return 'UHD/HDR';
    default:
      return '720p';
  }
};

const parseCategories = (event: IFoxEvent) => {
  const categories = ['FOX Sports', 'FOX'];
  for (const classifier of [...(event.categoryTags || []), ...(event.genres || [])]) {
    if (classifier !== null) {
      categories.push(classifier);
    }
  }

  if (event.sportTag) {
    categories.push(event.sportTag);
  }

  if (event.streamTypes?.find(resolution => resolution === 'HDR' || resolution === 'SDR') || event.isUHD) {
    categories.push('4K');
  }

  return [...new Set(categories)];
};

const parseAirings = async (events: IFoxEvent[]) => {
  const useLinear = await usesLinear();

  const [now, inTwoDays] = normalTimeRange();

  const {meta} = await db.providers.findOne<IProvider<any, IFoxMeta>>({name: 'foxsports'});

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.id});

    if (!entryExists) {
      const start = moment(event.startDate);
      const end = moment(event.endDate);
      const originalEnd = moment(event.endDate);

      const isLinear = event.network !== 'fox' && useLinear;

      if (!isLinear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now) || start.isAfter(inTwoDays)) {
        continue;
      }

      const categories = parseCategories(event);

      if (meta.only4k && !_.some(categories, category => category === '4K')) {
        continue;
      }

      const eventName = `${event.sportTag === 'NFL' ? `${event.sportTag} - ` : ''}${event.name}`;

      console.log('Adding event: ', eventName);

      await db.entries.insert<IEntry>({
        categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'foxsports',
        id: event.id,
        image: event.images.logo?.FHD || event.images.seriesDetail?.FHD || event.images.seriesList?.FHD,
        name: eventName,
        network: event.callSign,
        originalEnd: originalEnd.valueOf(),
        replay: event.airingType !== 'live',
        start: start.valueOf(),
        ...(isLinear && {
          channel: event.network,
          linear: true,
        }),
      });
    }
  }
};

const FOX_APP_CONFIG = 'https://config.foxdcg.com/foxsports/androidtv-native/3.42/info.json';

// Will prelim token expire in the next month?
const willPrelimTokenExpire = (token: IAdobePrelimAuthToken): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 * 30 > (token?.tokenExpiration || 0);
// Will auth token expire in the next day?
const willAuthTokenExpire = (token: IAdobeAuthFox): boolean =>
  new Date().valueOf() + 3600 * 1000 * 24 > (token?.tokenExpiration || 0);

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
    const setup = (await db.providers.count({name: 'foxsports'})) > 0 ? true : false;

    if (!setup) {
      const data: TFoxTokens = {};

      if (useFoxSports) {
        this.loadJSON();

        data.adobe_auth = this.adobe_auth;
        data.adobe_device_id = this.adobe_device_id;
        data.adobe_prelim_auth_token = this.adobe_prelim_auth_token;
      }

      await db.providers.insert<IProvider<TFoxTokens, IFoxMeta>>({
        enabled: useFoxSports,
        linear_channels: [
          {
            enabled: true,
            id: 'fs1',
            name: 'FS1',
            tmsId: '82547',
          },
          {
            enabled: true,
            id: 'fs2',
            name: 'FS2',
            tmsId: '59305',
          },
          {
            enabled: true,
            id: 'btn',
            name: 'B1G Network',
            tmsId: '58321',
          },
          {
            enabled: true,
            id: 'fox-soccer-plus',
            name: 'FOX Soccer Plus',
            tmsId: '66880',
          },
        ],
        meta: {
          only4k: useFoxOnly4k,
          uhd: getMaxRes(process.env.MAX_RESOLUTION) === 'UHD/HDR',
        },
        name: 'foxsports',
        tokens: data,
      });

      if (fs.existsSync(foxConfigPath)) {
        fs.rmSync(foxConfigPath);
      }
    }

    if (useFoxSports) {
      console.log('Using FOXSPORTS variable is no longer needed. Please use the UI going forward');
    }
    if (useFoxOnly4k) {
      console.log('Using FOX_ONLY_4K variable is no longer needed. Please use the UI going forward');
    }
    if (process.env.MAX_RESOLUTION) {
      console.log('Using MAX_RESOLUTION variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOne<IProvider>({name: 'foxsports'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();

    await this.getEntitlements();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'foxsports'});

    if (!enabled) {
      return;
    }

    if (!this.adobe_prelim_auth_token || willPrelimTokenExpire(this.adobe_prelim_auth_token)) {
      console.log('Updating FOX Sports prelim token');
      await this.getPrelimToken();
    }

    if (willAuthTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (FOX Sports)');
      await this.authenticateRegCode();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'foxsports'});

    if (!enabled) {
      return;
    }

    console.log('Looking for FOX Sports events...');

    try {
      const entries = await this.getEvents();
      await parseAirings(entries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse FOX Sports events');
    }
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

      let cdn = 'fastly';
      let data;

      // while (cdn !== 'akamai|limelight|fastly') {
      while (cdn === 'fastly') {
        data = await this.getSteamData(eventId);
        cdn = data.trackingData.properties.CDN;
      }

      if (!data || !data?.url) {
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

  private getSteamData = async (eventId: string): Promise<any> => {
    const {meta} = await db.providers.findOne<IProvider<any, IFoxMeta>>({name: 'foxsports'});
    const {uhd} = meta;

    const streamOrder = ['UHD/HDR', '720p'];

    let resIndex = streamOrder.findIndex(i => i === getMaxRes(uhd ? 'UHD/HDR' : ''));

    if (resIndex < 0) {
      resIndex = 1;
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    let watchData;

    for (let a = resIndex; a < streamOrder.length; a++) {
      try {
        const {data} = await axios.post(
          this.appConfig.api.content.watch,
          {
            capabilities: ['fsdk/yo/v3'],
            deviceHeight: 2160,
            deviceWidth: 3840,
            maxRes: streamOrder[a],
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

        watchData = data;
        break;
      } catch (e) {
        console.log(
          `Could not get stream data for ${streamOrder[a]}. ${
            streamOrder[a + 1] ? `Trying to get ${streamOrder[a + 1]} next...` : ''
          }`,
        );
      }
    }

    return watchData;
  };

  private getEvents = async (): Promise<IFoxEvent[]> => {
    if (!this.appConfig) {
      await this.getAppConfig();
    }

    const useLinear = await usesLinear();

    const events: IFoxEvent[] = [];

    const [now, inTwoDays] = normalTimeRange();
    now.startOf('day');

    const dateRange = `${now.toISOString()}..${inTwoDays.toISOString()}`;

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

      debug.saveRequestData(data, 'foxsports', 'epg');

      _.forEach(data.panels.member, member => {
        _.forEach(member.items.member, m => {
          if (
            _.some(this.entitlements, network => network === getEventNetwork(m)) &&
            !m.audioOnly &&
            m.startDate &&
            m.endDate &&
            m.id
          ) {
            if (!useLinear) {
              if (m.airingType === 'live' || m.airingType === 'new') {
                events.push(m);
              }
            } else {
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
      if (!this.appConfig) {
        await this.getAppConfig();
      }

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
      if (!this.appConfig) {
        await this.getAppConfig();
      }

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
      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get information to start Fox Sports login flow');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.adobe_device_id = _.take(getRandomHex(), 16).join('');
    this.adobe_auth = undefined;

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    await this.getPrelimToken();

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

      return data.code;
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for Fox Sports!');
    }
  };

  public authenticateRegCode = async (showAuthnError = true): Promise<boolean> => {
    try {
      if (!this.appConfig) {
        await this.getAppConfig();
      }

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
      await this.save();

      await this.getEntitlements();

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

  private save = async () => {
    await db.providers.update({name: 'foxsports'}, {$set: {tokens: _.omit(this, 'appConfig', 'entitlements')}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOne<IProvider<TFoxTokens>>({name: 'foxsports'});
    const {adobe_device_id, adobe_auth, adobe_prelim_auth_token} = tokens;

    this.adobe_device_id = adobe_device_id;
    this.adobe_auth = adobe_auth;
    this.adobe_prelim_auth_token = adobe_prelim_auth_token;
  };

  private loadJSON = () => {
    if (fs.existsSync(foxConfigPath)) {
      const {adobe_device_id, adobe_auth, adobe_prelim_auth_token} = fsExtra.readJSONSync(foxConfigPath);

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
      this.adobe_prelim_auth_token = adobe_prelim_auth_token;
    }
  };
}

export type TFoxTokens = ClassTypeWithoutMethods<FoxHandler>;

export const foxHandler = new FoxHandler();
