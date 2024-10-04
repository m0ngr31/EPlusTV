import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';
import CryptoJS from 'crypto-js';

import {configPath} from './config';
import {useMsgPlus} from './networks';
import {getRandomUUID} from './shared-helpers';
import {db} from './database';
import {IEntry, IHeaders} from './shared-interfaces';
import {okHttpUserAgent} from './user-agent';
import {useLinear} from './channels';

const API_KEY = [
  'c',
  '2',
  '4',
  '9',
  'f',
  '1',
  '9',
  '4',
  '-',
  'e',
  '1',
  'b',
  'f',
  '-',
  '4',
  'a',
  '7',
  '2',
  '-',
  '9',
  '3',
  '2',
  'b',
  '-',
  '9',
  '8',
  'b',
  '8',
  '6',
  'd',
  '1',
  '8',
  'd',
  '3',
  '2',
  'c',
].join('');

const BASE_API_URL = ['https://', 'rest-prod', '-msgn', '.evergent.', 'com/msgn'].join('');
const BASE_ADOBE_URL = ['https://', 'api.auth', '.adobe.com', '/api/v1'].join('');

interface IAppConfig {
  apiKey: string;
  channelPartnerId: string;
  clientSecret: string;
  clientId: string;
  xClientIds: {
    androidtv: string;
  };
}

interface IEntitlements {
  message: string;
  ovatToken: string;
  AccountServiceMessage: {
    [key: string]: string | number | boolean;
  }[];
}

interface ISigningRes {
  secret: string;
  expiry: number;
  deviceId: string;
}

// Function to replace characters for Base64 URL encoding
const base64UrlEncode = (text: string) => text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

// Function to convert a string to Base64 URL format
const utf8ToBase64Url = (text: string) => base64UrlEncode(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text)));

const JWTEncode = (header, payload, secretKey) => {
  // Create an array to hold the JWT segments
  const jwtSegments = [utf8ToBase64Url(JSON.stringify(header)), utf8ToBase64Url(JSON.stringify(payload))];

  // Calculate the HMAC signature based on the chosen algorithm
  const signature = base64UrlEncode(
    CryptoJS.HmacSHA256(jwtSegments.join('.'), secretKey).toString(CryptoJS.enc.Base64),
  );

  // Add the signature to the JWT segments and return the final JWT string
  jwtSegments.push(signature);

  return jwtSegments.join('.');
};

const parseAirings = async (events: any[]) => {
  const now = moment();
  const inTwoDays = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: `${event.contentId}`});

    if (!entryExists) {
      const start = moment(event.start);
      const end = moment(event.end);

      if (!useLinear) {
        start.subtract(30, 'minutes'); // For Pre-game
      }

      if (end.isBefore(now) || start.isAfter(inTwoDays)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insert<IEntry>({
        categories: event.categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'msg+',
        id: event.contentId,
        image: event.artwork,
        name: event.title,
        network: event.network,
        sport: event.sport,
        start: start.valueOf(),
        ...(event.linear && {
          channel: event.channel,
          linear: true,
        }),
      });
    }
  }
};

class MSGHandler {
  private appConfig?: IAppConfig;
  private access_token?: string;
  private entitlement_token?: string;

  public device_id?: string;
  public auth_token?: string;
  public refresh_token?: string;
  public expiresIn?: number;
  public adobe_token?: string;
  public adobe_token_expires?: number;

  public initialize = async () => {
    if (!useMsgPlus) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = getRandomUUID();

      this.save();
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    if (!this.access_token) {
      await this.getAccessToken();
    }

    if (
      !this.auth_token ||
      !this.refresh_token ||
      !this.expiresIn ||
      moment().valueOf() > moment(this.expiresIn).valueOf()
    ) {
      await this.loginUser();
    }

    if (!this.entitlement_token) {
      await this.getEntitlements();
    }

    if (!this.adobe_token) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useMsgPlus) {
      return;
    }

    await this.getAccessToken();
    await this.authenticateRegCode();

    if (moment().add(20, 'hours').isAfter(this.expiresIn)) {
      console.log('Refreshing MSG+ auth token');
      await this.getNewTokens();
    }

    if (moment().isAfter(this.adobe_token_expires)) {
      console.log('Refreshing MSG+ Adobe token');
      const didUpdate = await this.authenticateRegCode();

      if (!didUpdate) {
        this.adobe_token = undefined;
        this.adobe_token_expires = undefined;
        this.save();

        console.log('MSG+ needs to reauthenticate with your TV Provider');
        await this.startProviderAuthFlow();
      }
    }
  };

  public getSchedule = async () => {
    if (!useMsgPlus) {
      return;
    }

    console.log('Looking for MSG+ events...');

    try {
      const today = new Date();
      const entries = [];

      for (const [i] of [0, 1, 2].entries()) {
        const date = moment(today).add(i, 'days');

        try {
          const {data} = await axios.get(
            `https://data-store-cdn.api.msgncms.quickplay.com/content/epg?${new URLSearchParams({
              client: 'msg-msgplus-web',
              dt: 'web',
              reg: 'zone-1',
              start: date.startOf('day').toISOString(),
            })}`,
          );

          (data.data || []).forEach(channel => {
            (channel.airing || []).forEach(airing => {
              const eventName = airing.pgm.lon[0].n.replace(/\n/g, '');

              if (useLinear && eventName !== 'NO PROGRAMMING - OFF AIR') {
                entries.push({
                  artwork: `https://image-resizer-cloud-cdn.api.msgncms.quickplay.com/image/${airing.cid}/3-16x9.png?width=400`,
                  categories: ['MSG', 'MSG+', 'HD', 'Sports', airing?.pgm?.spt_lg, airing?.pgm?.spt_ty],
                  channel: channel.cs.split('_')[1],
                  contentId: `${airing.id}----${airing.cid}`,
                  end: airing.sc_ed_dt,
                  linear: true,
                  network: airing.net,
                  sport: airing.pgm?.spt_lg,
                  start: airing.sc_st_dt,
                  title: eventName,
                });
              } else {
                if (airing.ev_live === 'true' && (airing.ca_ty === 'game' || airing.pgm.lon[0].n.indexOf(' vs') > -1)) {
                  entries.push({
                    artwork: `https://image-resizer-cloud-cdn.api.msgncms.quickplay.com/image/${airing.cid}/3-16x9.png?width=400`,
                    categories: ['MSG', 'MSG+', 'HD', 'Sports', airing?.pgm?.spt_lg, airing?.pgm?.spt_ty],
                    contentId: `${airing.id}----${airing.cid}`,
                    end: airing.sc_ed_dt,
                    network: airing.net,
                    sport: airing.pgm?.spt_lg,
                    start: airing.sc_st_dt,
                    title: eventName,
                  });
                }
              }
            });
          });
        } catch (e) {
          throw new Error('Could not get schedule for MSG+');
        }
      }

      try {
        await parseAirings(entries);
      } catch (e) {
        console.log('Could not parse events');
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get schedule for MSG+');
    }
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
    try {
      const channelId = eventId.split('----')[1];

      await this.pingAdobeAuth();

      const mediaToken = await this.getAdobeMediaToken();
      const deviceIdToken = await this.getDeviceIdToken();

      const authUrl = [
        'https://',
        'playback-auth-service',
        '.api.msgplus.',
        'quickplay.com/',
        'media/content/',
        'authorize',
      ].join('');

      const {data} = await axios.post(
        `${authUrl}`,
        {
          catalogType: 'channel',
          contentId: channelId,
          contentTypeId: 'live',
          delivery: 'streaming',
          deviceId: this.device_id,
          deviceName: 'web',
          deviceToken: deviceIdToken,
          disableSsai: 'false',
          drm: 'fairplay',
          mediaFormat: 'hls',
          playbackMode: 'live',
          proxyDeviceId: '',
          quality: 'medium',
          supportedAudio: '',
          supportedAudioCodecs: 'mp4a',
          supportedMaxWVSecurityLevel: 'L3',
          supportedResolution: '4K',
          supportedVideoCodecs: 'avc,av01',
          urlParameters: {},
        },
        {
          headers: {
            Authorization: `Bearer ${this.access_token}`,
            'user-agent': okHttpUserAgent,
            'x-adobe-authorization': mediaToken,
            'x-authorization': this.entitlement_token,
            'x-client-id': this.appConfig.xClientIds.androidtv,
            'x-device-id': deviceIdToken,
          },
        },
      );

      if (!data) {
        throw new Error('Could not get stream data. Event might be upcoming, ended, or in blackout...');
      }

      return [data.data.contentUrl, {}];
    } catch (e) {
      // console.error(e);
      console.log('Could not get stream information!');
    }
  };

  private get adobeParams(): URLSearchParams {
    return new URLSearchParams({
      deviceId: this.device_id,
      requestor: 'MSG',
      resource: 'MSGGO',
    });
  }

  private pingAdobeAuth = async (): Promise<void> => {
    await this.authenticateRegCode();

    try {
      await axios.get(`${BASE_ADOBE_URL}/authorize?${this.adobeParams}`, {
        headers: {
          Authorization: `Bearer ${this.adobe_token}`,
          'user-agent': okHttpUserAgent,
        },
      });

      await axios.get(`${BASE_ADOBE_URL}/tokens/authz?${this.adobeParams}`, {
        headers: {
          Authorization: `Bearer ${this.adobe_token}`,
          'user-agent': okHttpUserAgent,
        },
      });
    } catch (e) {
      console.error(e);
      console.log('Could not ping Adobe');
    }
  };

  private getAdobeMediaToken = async (): Promise<string> => {
    await this.authenticateRegCode();

    try {
      const {data} = await axios.get(`${BASE_ADOBE_URL}/tokens/media?${this.adobeParams}`, {
        headers: {
          Authorization: `Bearer ${this.adobe_token}`,
          'user-agent': okHttpUserAgent,
        },
      });

      return data.serializedToken;
    } catch (e) {
      console.error(e);
      console.log('Could not ping Adobe');
    }
  };

  private getAppConfig = async (): Promise<void> => {
    try {
      const {data} = await axios.get<IAppConfig>(
        'https://dtc-api.msgnetworks.com/v1/Configuration/App?platform=androidtv&environment=prod&version=v1',
        {
          headers: {
            'user-agent': okHttpUserAgent,
            'x-api-key': API_KEY,
          },
        },
      );

      this.appConfig = data;
    } catch (e) {
      console.error(e);
      console.log('Could not get MSG+ app config');
    }
  };

  private getAccessToken = async (): Promise<void> => {
    try {
      const params = new URLSearchParams({
        audience: 'edge-service',
        client_id: this.appConfig.clientId,
        client_secret: this.appConfig.clientSecret,
        grant_type: 'client_credentials',
        scope: 'offline openid',
      });
      const {data} = await axios.post('https://auth-platform.api.msgplus.quickplay.com/oauth2/token', params, {
        headers: {
          'user-agent': okHttpUserAgent,
        },
      });

      this.access_token = data.access_token;
    } catch (e) {
      console.error(e);
      console.log('Could not get MSG+ access token');
    }
  };

  private loginUser = async (): Promise<void> => {
    try {
      const {data} = await axios.post(`${BASE_API_URL}/getOAuthAccessTokenv2`, {
        GetOAuthAccessTokenv2RequestMessage: {
          apiKey: this.appConfig.apiKey,
          channelPartnerID: this.appConfig.channelPartnerId,
          contactPassword: process.env.MSGPLUS_PASS,
          contactUserName: process.env.MSGPLUS_USER,
          deviceMessage: {
            deviceName: 'onn. 4K Streaming Box',
            deviceType: 'androidtv',
            modelNo: 'onn onn. 4K Streaming Box',
            serialNo: this.device_id,
          },
        },
      });

      this.auth_token = data.GetOAuthAccessTokenv2ResponseMessage.accessToken;
      this.refresh_token = data.GetOAuthAccessTokenv2ResponseMessage.refreshToken;
      this.expiresIn = +data.GetOAuthAccessTokenv2ResponseMessage.expiresIn;

      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not login to MSG+ with provided credentials!');
    }
  };

  private getNewTokens = async (): Promise<void> => {
    try {
      const {data} = await axios.post(`${BASE_API_URL}/refreshToken`, {
        RefreshTokenRequestMessage: {
          apiKey: this.appConfig.apiKey,
          channelPartnerID: this.appConfig.channelPartnerId,
          refreshToken: this.refresh_token,
        },
      });

      this.auth_token = data.RefreshTokenResponseMessage.accessToken;
      this.refresh_token = data.RefreshTokenResponseMessage.refreshToken;
      this.expiresIn = +data.RefreshTokenResponseMessage.expiresIn;

      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh tokens for MSG+!');
    }
  };

  private getEntitlements = async (): Promise<IEntitlements> => {
    try {
      const {data} = await axios.post<{GetEntitlementsResponseMessage: IEntitlements}>(
        `${BASE_API_URL}/getEntitlements`,
        {
          GetEntitlementsRequestMessage: {
            apiKey: this.appConfig.apiKey,
            channelPartnerID: this.appConfig.channelPartnerId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${this.auth_token}`,
          },
        },
      );

      if (data?.GetEntitlementsResponseMessage?.message !== 'SUCCESS') {
        throw new Error('Could not get entitlements for MSG+');
      }

      this.entitlement_token = data.GetEntitlementsResponseMessage.ovatToken;

      return data.GetEntitlementsResponseMessage;
    } catch (e) {
      console.error(e);
    }
  };

  private getDeviceIdToken = async (): Promise<string> => {
    const secretRes = await this.getSigningSecret();

    const now = moment();
    const secretKey = CryptoJS.enc.Base64.parse(secretRes.secret);

    /* eslint-disable sort-keys-custom-order-fix/sort-keys-custom-order-fix */
    return JWTEncode(
      {
        alg: 'HS256',
        typ: 'JWT',
      },
      {
        deviceId: secretRes.deviceId,
        aud: 'playback-auth-service',
        iat: now.unix(),
        exp: moment(now).add(30, 'seconds').unix(),
      },
      secretKey,
    );
    /* eslint-enable sort-keys-custom-order-fix/sort-keys-custom-order-fix */
  };

  private getSigningSecret = async (): Promise<ISigningRes> => {
    try {
      const {data} = await axios.post<{data: ISigningRes}>(
        'https://device-register-service.api.msgplus.quickplay.com/device/app/register',
        {
          UniqueId: this.device_id,
        },
        {
          headers: {
            authorization: `Bearer ${this.access_token}`,
            'user-agent': okHttpUserAgent,
            'x-authorization': this.entitlement_token,
            'x-client-id': this.appConfig.xClientIds.androidtv,
          },
        },
      );

      return data.data;
    } catch (e) {
      // console.error(e);
      console.log('Could not register device for MSG+');
    }
  };

  private registerDeviceToken = async (activationCode: string): Promise<void> => {
    try {
      const {data} = await axios.post(
        `${BASE_API_URL}/registerDevice`,
        {
          RegisterDeviceRequestMessage: {
            activationCode,
            apiKey: this.appConfig.apiKey,
            channelPartnerID: this.appConfig.channelPartnerId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${this.auth_token}`,
            'user-agent': okHttpUserAgent,
          },
        },
      );

      if (data?.RegisterDeviceResponseMessage?.message !== 'SUCCESS') {
        throw new Error('Could not register device code for MSG+');
      }
    } catch (e) {
      console.error(e);
      console.log('Could not register device code for MSG+');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const {data} = await axios.post(
        `${BASE_API_URL}/generateDeviceActivationCode`,
        {
          GenerateDeviceActivationCodeRequestMessage: {
            apiKey: this.appConfig.apiKey,
            channelPartnerID: this.appConfig.channelPartnerId,
            deviceDetails: {
              deviceName: 'onn. 4K Streaming Box',
              deviceType: 'androidtv',
              modelNo: 'onn onn. 4K Streaming Box',
              serialNo: this.device_id,
            },
          },
        },
        {
          headers: {
            authorization: `Bearer ${this.auth_token}`,
            'user-agent': okHttpUserAgent,
          },
        },
      );

      await this.registerDeviceToken(data.GenerateDeviceActivationCodeResponseMessage?.activationCode);

      console.log('=== TV Provider Auth ===');
      console.log('Please open a browser window and go to: https://www.msgplus.tv/provider');
      console.log('Enter code: ', data.GenerateDeviceActivationCodeResponseMessage?.activationCode);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 3 minutes
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
      console.log('Could not start the authentication process for MSG+!');
    }
  };

  private authenticateRegCode = async (): Promise<boolean> => {
    try {
      const entitlements = await this.getEntitlements();

      if (!entitlements.AccountServiceMessage.length) {
        return false;
      }

      const {data} = await axios.post(
        `${BASE_API_URL}/getAdobeAccessToken`,
        {
          GetAdobeAccessTokenRequestMessage: {
            apiKey: this.appConfig.apiKey,
            channelPartnerID: this.appConfig.channelPartnerId,
          },
        },
        {
          headers: {
            authorization: `Bearer ${this.auth_token}`,
          },
        },
      );

      if (!data.GetAdobeAccessTokenResponseMessage || data.GetAdobeAccessTokenResponseMessage?.message !== 'SUCCESS') {
        return false;
      }

      this.adobe_token_expires = +data.GetAdobeAccessTokenResponseMessage.expiresIn;
      this.adobe_token = data.GetAdobeAccessTokenResponseMessage.adobeAccessToken;

      this.save();

      await this.refreshProviderToken();

      return true;
    } catch (e) {
      return false;
    }
  };

  private refreshProviderToken = async (): Promise<void> => {
    if (!this.adobe_token) {
      await this.startProviderAuthFlow();
      return;
    }

    const renewUrl = [`${BASE_ADOBE_URL}/tokens/authn`, `?deviceId=${this.device_id}`, '&requestor=MSG'].join('');

    try {
      await axios.get(renewUrl, {
        headers: {
          Authorization: `Bearer ${this.adobe_token}`,
          'User-Agent': okHttpUserAgent,
        },
      });
    } catch (e) {}
  };

  private save = () => {
    fsExtra.writeJSONSync(
      path.join(configPath, 'msg_tokens.json'),
      _.omit(this, 'appConfig', 'access_token', 'entitlement_token'),
      {
        spaces: 2,
      },
    );
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'msg_tokens.json'))) {
      const {device_id, auth_token, refresh_token, expiresIn, adobe_token_expires, adobe_token} = fsExtra.readJSONSync(
        path.join(configPath, 'msg_tokens.json'),
      );

      this.device_id = device_id;
      this.auth_token = auth_token;
      this.refresh_token = refresh_token;
      this.expiresIn = expiresIn;
      this.adobe_token_expires = adobe_token_expires;
      this.adobe_token = adobe_token;
    }
  };
}

export const msgHandler = new MSGHandler();
