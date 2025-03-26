import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import xml from 'fast-xml-parser';
import jwt_decode from 'jwt-decode';

import {okHttpUserAgent, adobeNesnUserAgent} from './user-agent';
import {configPath} from './config';
import {useNesn} from './networks';
import {ClassTypeWithoutMethods, IEntry, IJWToken, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {getRandomHex, getRandomUUID, normalTimeRange} from './shared-helpers';
import {debug} from './debug';
import {usesLinear} from './misc-db-service';

const ADOBE_CLIENT_ID = [
  '6',
  'a',
  '3',
  '9',
  '1',
  'a',
  'b',
  'e',
  '-',
  '5',
  'c',
  '8',
  '2',
  '-',
  '4',
  '4',
  '3',
  '4',
  '-',
  'a',
  '5',
  '5',
  '3',
  '-',
  'd',
  '8',
  '3',
  '1',
  '0',
  'd',
  '5',
  'f',
  '8',
  '7',
  'f',
  'f',
].join('');

const ADOBE_CLIENT_SECRET = [
  'f',
  'f',
  '9',
  'b',
  'e',
  '5',
  'c',
  'f',
  '-',
  '8',
  '2',
  'f',
  '1',
  '-',
  '4',
  '6',
  'a',
  '0',
  '-',
  '9',
  'd',
  '0',
  '7',
  '-',
  '7',
  '7',
  '1',
  '6',
  '4',
  'e',
  '5',
  '2',
  '4',
  '0',
  '8',
  '1',
].join('');

const BASIC_AUTH_TOKEN = [
  'b',
  'W',
  'F',
  'j',
  'a',
  'G',
  'l',
  'u',
  'Z',
  'X',
  'V',
  'z',
  'Z',
  'X',
  'I',
  '6',
  'U',
  '1',
  'R',
  'v',
  'c',
  'C',
  'B',
  'x',
  'c',
  'X',
  'R',
  '3',
  'I',
  'F',
  'V',
  'q',
  'd',
  '2',
  'c',
  'g',
  'c',
  '1',
  'Y',
  '0',
  'd',
  'S',
  'B',
  'Q',
  'V',
  'm',
  'Z',
  'D',
  'I',
  'H',
  'l',
  'V',
  'Z',
  'W',
  'Y',
  '=',
].join('');

const SHORT_AUTH = ['s', 'k', '_', '8', 'h', 'c', '4', 'w', 'I', 'o', '5', 'X', 'c', 'y', 'G', 'h', 'a', 'Q', '1'].join(
  '',
);

const COGNITO_APP_ID = [
  '5',
  'n',
  'a',
  '8',
  '9',
  '8',
  's',
  'o',
  'j',
  '4',
  'l',
  'r',
  '4',
  's',
  'k',
  '1',
  '6',
  '2',
  'l',
  'v',
  'e',
  'l',
  'd',
  '6',
  '9',
  't',
].join('');

const DEVICE_INFO = Buffer.from(
  JSON.stringify({
    manufacturer: 'Google',
    model: 'sdk_google_atv_x86',
    osName: 'Android',
    osVersion: '10',
    vendor: 'google',
    version: 'generic_x86',
  }),
  'utf-8',
).toString('base64');

const SCHEDULES = ['tvschedule', 'nesnplusschedule', 'battingschedule'];

interface INesnEvent {
  id: string;
  categories: string[];
  name: string;
  image: string;
  network: string;
  sport: string;
  start: moment.Moment;
  end: moment.Moment;
  replay?: boolean;
}

const isTokenValid = (token?: string): boolean => {
  if (!token) {
    return false;
  }

  try {
    const decoded: IJWToken = jwt_decode(token);
    return new Date().valueOf() / 1000 < decoded.exp;
  } catch (e) {
    return false;
  }
};

const willTokenExpire = (token?: string): boolean => {
  if (!token) return true;

  try {
    const decoded: IJWToken = jwt_decode(token);
    // Will the token expire in the next hour?
    return Math.floor(new Date().valueOf() / 1000) + 3600 > decoded.exp;
  } catch (e) {
    return true;
  }
};

const parseAirings = async (events: INesnEvent[]) => {
  const useLinear = await usesLinear();

  for (const event of events) {
    const entryExists = await db.entries.findOneAsync<IEntry>({id: event.id});

    if (!entryExists) {
      console.log('Adding event: ', event.name);

      await db.entries.insertAsync<IEntry>({
        categories: event.categories,
        duration: event.end.diff(event.start, 'seconds'),
        end: useLinear ? event.end.valueOf() : moment(event.end).add(1, 'hour').valueOf(),
        from: 'nesn',
        id: event.id,
        image: event.image,
        name: event.name,
        network: event.network,
        originalEnd: moment(event.end).valueOf(),
        replay: event.replay,
        sport: event.sport,
        start: event.start.valueOf(),
        ...(useLinear &&
          event.network !== 'NESN 4K' && {
            channel: event.network,
            linear: true,
          }),
      });
    }
  }
};

const nesnConfigPath = path.join(configPath, 'nesn_tokens.json');

class NesnHandler {
  public device_id?: string;
  public adobe_device_id?: string;
  public cognito_id?: string;
  public cognito_access_token?: string;
  public cognito_refresh_token?: string;
  public cognito_id_token?: string;
  public cognito_expires_at?: number;
  public mvpd_id?: string;
  public user_id?: string;
  public authz_token?: string;

  private adobe_auth_token?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'nesn'})) > 0 ? true : false;

    if (!setup) {
      const data: TNesnTokens = {};

      if (useNesn) {
        this.loadJSON();

        data.adobe_device_id = this.adobe_device_id;
        data.authz_token = this.authz_token;
        data.cognito_access_token = this.cognito_access_token;
        data.cognito_expires_at = this.cognito_expires_at;
        data.cognito_id = this.cognito_id;
        data.cognito_id_token = this.cognito_id_token;
        data.cognito_refresh_token = this.cognito_refresh_token;
        data.device_id = this.device_id;
        data.mvpd_id = this.mvpd_id;
        data.user_id = this.user_id;
      }

      await db.providers.insertAsync<IProvider<TNesnTokens>>({
        enabled: useNesn,
        linear_channels: [
          {
            enabled: true,
            id: 'NESN',
            name: 'New England Sports Network HD',
            tmsId: '35038',
          },
          {
            enabled: true,
            id: 'NESN+',
            name: 'New England Sports Network Plus HD',
            tmsId: '63516',
          },
        ],
        name: 'nesn',
        tokens: data,
      });

      if (fs.existsSync(nesnConfigPath)) {
        fs.rmSync(nesnConfigPath);
      }
    }

    if (useNesn) {
      console.log('Using NESN variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nesn'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();

    if (!this.user_id) {
      await this.getUserId();
    }
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nesn'});

    if (!enabled) {
      return;
    }

    if (moment(this.cognito_expires_at).isBefore(moment().add(6, 'hours'))) {
      await this.refreshToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nesn'});

    if (!enabled) {
      return;
    }

    console.log('Looking for NESN events...');

    const entries: INesnEvent[] = [];

    const [now, end] = normalTimeRange();

    try {
      for (const schedule of SCHEDULES) {
        const url = ['https://', 'nesn.com', '/wp-json/nesn', '/v2/tv?schedule=', schedule].join('');

        const {data} = await axios.get(url, {
          headers: {
            'User-Agent': okHttpUserAgent,
            authorization: `Basic ${BASIC_AUTH_TOKEN}`,
          },
        });

        debug.saveRequestData(data, 'nesn', 'epg');

        for (const event of data) {
          const eventStart = moment.utc(
            `${event['Start Date (UTC)']} ${event['Start Time (UTC)']}`,
            'M/D/YYYY H:mm:ss',
          );
          const timeCode = event.Length.split(':');
          const eventDuration = moment.duration({
            hours: parseInt(timeCode[0]),
            minutes: parseInt(timeCode[1]),
            seconds: parseInt(timeCode[2]),
          });
          const eventEnd = moment(eventStart).add(eventDuration, 'minutes');

          if (eventStart.isBefore(end) && eventEnd.isAfter(now)) {
            const transformedEvent: INesnEvent = {
              categories: ['NESN'],
              end: eventEnd,
              id: `${schedule}-${eventStart.valueOf()}-${event['Title Code']}`,
              image: event.Hero,
              name: `${event['Program Name']} - ${event['Title Name']}`,
              network: schedule === 'tvschedule' ? 'NESN' : schedule === 'nesnplusschedule' ? 'NESN+' : 'NESN 4K',
              replay: event.Airing !== 'LIVE' && event.Airing === 'NEW',
              sport: '',
              start: eventStart,
            };

            if (schedule === 'nesnplusschedule') {
              transformedEvent.categories.push('NESN+');
            } else if (schedule === 'battingschedule') {
              if (event.Format !== '4K') {
                continue;
              }

              transformedEvent.categories.push('4K');
            }

            entries.push(transformedEvent);
          }
        }
      }
    } catch (e) {
      console.error(e);
      console.log('Could not parse NESN events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    try {
      const baseUrl = ['https://t2qkxvxfw6.execute-api.us-east-2.amazonaws.com/v3/stream?stream_type='];
      const nesnUrl = [...baseUrl, 'nesn_stream'].join('');
      const nesnPlusUrl = [...baseUrl, 'plus_stream'].join('');
      const nesn4k = [...baseUrl, '4k_stream'].join('');

      await this.refreshTokens();

      const playbackToken = await this.getPlaybackToken();

      const event = await db.entries.findOneAsync<IEntry>({id: eventId});

      if (!event) {
        throw new Error('Could not locate event');
      }

      const url = event.network === 'NESN' ? nesnUrl : event.network === 'NESN+' ? nesnPlusUrl : nesn4k;

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': okHttpUserAgent,
          'nesn-device-hardware': 'Google - sdk_google_atv_x86',
          'nesn-device-type': 'ott',
          'nesn-platform': 'android_tv',
          'nesn-playback-token': playbackToken,
        },
      });

      let hlsStream = '';

      data.sources.forEach(s => {
        if (s.streamURL && hlsStream.length === 0) {
          hlsStream = s.streamURL;
        }
      });

      return [hlsStream, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private getAdobeAccessToken = async (): Promise<string> => {
    try {
      if (this.adobe_auth_token) {
        if (isTokenValid(this.adobe_auth_token) && !willTokenExpire(this.adobe_auth_token)) {
          return this.adobe_auth_token;
        }
      }

      const url = ['https://', 'sp.auth.adobe.com', '/o/client/token'].join('');

      const params = new URLSearchParams({
        client_id: ADOBE_CLIENT_ID,
        client_secret: ADOBE_CLIENT_SECRET,
        grant_type: 'client_credentials',
      });

      const {data} = await axios.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': okHttpUserAgent,
        },
      });

      this.adobe_auth_token = data.access_token;

      return data.access_token;
    } catch (e) {
      console.error(e);
      console.log('Could not get adobe tokens for NESN');
    }
  };

  private getAdobeReggieCode = async (): Promise<string> => {
    try {
      const url = [
        'https://',
        'sp.auth.adobe.com',
        '/reggie/v1/NESNGO',
        '/regcode',
        '?deviceId=',
        this.adobe_device_id,
      ].join('');

      const access_token = await this.getAdobeAccessToken();

      const params = new URLSearchParams({
        access_token,
        device_info: DEVICE_INFO,
        networkType: 'WIFI',
      });

      const {data} = await axios.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': okHttpUserAgent,
        },
      });

      return data.code;
    } catch (e) {
      console.error(e);
      console.log('Could not get Adobe reggie code');
    }
  };

  private getAdobeSessionDevice = async (reg_code: string): Promise<string> => {
    try {
      const access_token = await this.getAdobeAccessToken();

      const url = ['https://', 'sp.auth.adobe.com', '/adobe-services/sessionDevice'].join('');

      const params = new URLSearchParams({
        _method: 'GET',
        device_id: this.adobe_device_id,
        device_info: DEVICE_INFO,
        networkType: 'WIFI',
        reg_code,
        requestor_id: 'NESNGO',
      });

      const {data} = await axios.post(url, params, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': adobeNesnUserAgent,
        },
      });

      const xmlParser = new xml.XMLParser();
      const xmlData = xmlParser.parse(data);

      return xmlData.result.authnToken;
    } catch (e) {
      console.error(e);
      console.log('Could not get Adobe session device');
    }
  };

  private authorizeAdobeDevice = async (authentication_token: string): Promise<string> => {
    try {
      const access_token = await this.getAdobeAccessToken();

      const url = ['https://', 'sp.auth.adobe.com', '/adobe-services/authorizeDevice'].join('');

      const params = new URLSearchParams({
        authentication_token,
        device_id: this.adobe_device_id,
        device_info: DEVICE_INFO,
        mso_id: this.mvpd_id,
        networkType: 'WIFI',
        requestor_id: 'NESNGO',
        resource_id: 'NESN',
        userMeta: '1',
      });

      const {data} = await axios.post(url, params, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': adobeNesnUserAgent,
        },
      });

      const xmlParser = new xml.XMLParser();
      const xmlData = xmlParser.parse(data);

      return xmlData.result.authzToken;
    } catch (e) {
      console.error(e);
      console.log('Could not authorize Adobe device');
    }
  };

  private shortAuthorizeAdobeDevice = async (): Promise<string> => {
    try {
      const access_token = await this.getAdobeAccessToken();

      const url = ['https://', 'sp.auth.adobe.com', '/adobe-services/deviceShortAuthorize'].join('');

      const params = new URLSearchParams({
        authz_token: this.authz_token,
        device_id: this.adobe_device_id,
        device_info: DEVICE_INFO,
        hashed_guid: 'false',
        mso_id: this.mvpd_id,
        networkType: 'WIFI',
        requestor_id: 'NESNGO',
        session_guid: getRandomHex(),
      });

      const {data} = await axios.post(url, params, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': adobeNesnUserAgent,
        },
      });

      return data;
    } catch (e) {
      // console.error(e);
      console.log('Could not authorize Adobe device for NESN');
    }
  };

  private getPlaybackToken = async (): Promise<string> => {
    try {
      const url = ['https://', 't2qkxvxfw6.execute-api.us-east-2.amazonaws.com', '/v3/users/', this.user_id].join('');

      const tveToken = await this.shortAuthorizeAdobeDevice();

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': okHttpUserAgent,
          'nesn-access-token': this.cognito_access_token,
          'nesn-app-version': 'Android TV 2.4',
          'nesn-country': 'US',
          'nesn-device-hardware': 'sdk_google_atv_x86',
          'nesn-device-id': this.device_id,
          'nesn-device-type': 'ott',
          'nesn-location-check-prompt': 'app_open',
          'nesn-location-check-type': 'ip_address',
          'nesn-mvpd': this.mvpd_id,
          'nesn-platform': 'android_tv',
          'nesn-request-attempt': 'check_entitlement',
          'nesn-state': 'MA',
          'nesn-tve-token': tveToken,
          'nesn-user-token': this.cognito_id_token,
          'nesn-user-zipcode': '02108',
          'nesn-via-proxy': false,
        },
      });

      return data?.subscription?.playbackToken;
    } catch (e) {
      console.error(e);
      console.log('Could not get playback token');
    }
  };

  private refreshToken = async (): Promise<void> => {
    try {
      const {data} = await axios.post(
        'https://cognito-idp.us-east-2.amazonaws.com/',
        {
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: {
            REFRESH_TOKEN: this.cognito_refresh_token,
          },
          ClientId: COGNITO_APP_ID,
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
            'content-type': 'application/x-amz-json-1.1',
            'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          },
        },
      );

      this.cognito_access_token = data.AuthenticationResult.AccessToken;
      this.cognito_id_token = data.AuthenticationResult.IdToken;
      this.cognito_expires_at = moment().add(1, 'day').valueOf();

      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh NESN token');
    }
  };

  private getUserId = async (): Promise<void> => {
    try {
      const {data} = await axios.post(
        'https://cognito-idp.us-east-2.amazonaws.com/',
        {
          AccessToken: this.cognito_access_token,
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
            'content-type': 'application/x-amz-json-1.1',
            'x-amz-target': 'AWSCognitoIdentityProviderService.GetUser',
          },
        },
      );

      this.user_id = data.Username;
      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get user ID');
    }
  };

  public getAuthCode = async (): Promise<[string, string, string]> => {
    this.device_id = getRandomUUID();
    this.adobe_device_id = `${getRandomHex()}${getRandomHex()}`;

    try {
      const codeUrl = ['https://', 'nesn.com', '/wp-json/nesn/v1/device'].join('');

      const {data} = await axios.post(
        codeUrl,
        {},
        {
          headers: {
            'User-Agent': okHttpUserAgent,
            authorization: `Basic ${BASIC_AUTH_TOKEN}`,
          },
        },
      );

      const code = data.code.replace(/ /g, '');

      const adobeReggieCode = await this.getAdobeReggieCode();

      const {data: loginInfo} = await axios.post(
        'https://api.short.io/links',
        {
          domain: 'tv.nesn.com',
          expiredURL: 'https://support.nesn.com',
          originalURL: `https://nesn.com/watch/authenticate/${adobeReggieCode}/${code}/googletv`,
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
            authorization: SHORT_AUTH,
          },
        },
      );

      const authUrl = loginInfo.secureShortURL.toLowerCase();

      return [authUrl, code, adobeReggieCode];
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for NESN!');
    }
  };

  public authenticateRegCode = async (code: string, adobeReggieCode: string): Promise<boolean> => {
    try {
      const url = ['https://', 'nesn.com', '/wp-json', '/nesn/v1/device/', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': okHttpUserAgent,
          authorization: `Basic ${BASIC_AUTH_TOKEN}`,
        },
      });

      if (!data) {
        return false;
      }

      this.cognito_id = data.cognitoSubID;
      this.cognito_access_token = data.cognitoAccessToken;
      this.cognito_id_token = data.cognitoIdToken;
      this.cognito_refresh_token = data.cognitoRefreshToken;
      this.mvpd_id = data.mvpdId;
      this.cognito_expires_at = moment().add(1, 'day').valueOf();

      await this.save();

      try {
        const authnToken = await this.getAdobeSessionDevice(adobeReggieCode);
        this.authz_token = await this.authorizeAdobeDevice(authnToken);

        await this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not register adobe device');
      }

      await this.getUserId();

      return true;
    } catch (e) {
      // console.log(e.response.status, e.config.url);
      return false;
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'nesn'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TNesnTokens>>({name: 'nesn'});
    const {
      cognito_access_token,
      cognito_id,
      cognito_refresh_token,
      cognito_id_token,
      cognito_expires_at,
      mvpd_id,
      device_id,
      user_id,
      adobe_device_id,
      authz_token,
    } = tokens;

    this.device_id = device_id;
    this.adobe_device_id = adobe_device_id;
    this.cognito_access_token = cognito_access_token;
    this.cognito_id = cognito_id;
    this.cognito_refresh_token = cognito_refresh_token;
    this.cognito_expires_at = cognito_expires_at;
    this.cognito_id_token = cognito_id_token;
    this.mvpd_id = mvpd_id;
    this.user_id = user_id;
    this.authz_token = authz_token;
  };

  private loadJSON = () => {
    if (fs.existsSync(nesnConfigPath)) {
      const {
        cognito_access_token,
        cognito_id,
        cognito_refresh_token,
        cognito_id_token,
        cognito_expires_at,
        mvpd_id,
        device_id,
        user_id,
        adobe_device_id,
        authz_token,
      } = fsExtra.readJSONSync(path.join(configPath, 'nesn_tokens.json'));

      this.device_id = device_id;
      this.adobe_device_id = adobe_device_id;
      this.cognito_access_token = cognito_access_token;
      this.cognito_id = cognito_id;
      this.cognito_refresh_token = cognito_refresh_token;
      this.cognito_expires_at = cognito_expires_at;
      this.cognito_id_token = cognito_id_token;
      this.mvpd_id = mvpd_id;
      this.user_id = user_id;
      this.authz_token = authz_token;
    }
  };
}

export type TNesnTokens = ClassTypeWithoutMethods<NesnHandler>;

export const nesnHandler = new NesnHandler();
