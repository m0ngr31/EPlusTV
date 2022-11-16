import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import Sockette from 'sockette';
import ws from 'ws';
import jwt_decode from 'jwt-decode';
import _ from 'lodash';
import url from 'url';

import { userAgent } from './user-agent';
import { configPath } from './init-directories';

global.WebSocket = ws;

const ANDROID_ID = 'ESPN-OTT.GC.ANDTV-PROD';

const DISNEY_ROOT_URL = 'https://registerdisney.go.com/jgc/v6/client';
const API_KEY_URL = '/{id-provider}/api-key?langPref=en-US';
const LICENSE_PLATE_URL = '/{id-provider}/license-plate';
const REFRESH_AUTH_URL = '/{id-provider}/guest/refresh-auth?langPref=en-US';

const BAM_API_KEY = 'ZXNwbiZicm93c2VyJjEuMC4w.ptUt7QxsteaRruuPmGZFaJByOoqKvDP2a5YkInHrc7c';
const BAM_APP_CONFIG = 'https://bam-sdk-configs.bamgrid.com/bam-sdk/v2.0/espn-a9b93989/browser/v3.4/linux/chrome/prod.json';

const getRandomHex = () => crypto.randomUUID().replace(/-/g, '');
const urlBuilder = (endpoint: string, provider: string) => `${DISNEY_ROOT_URL}${endpoint}`.replace('{id-provider}', provider);

const isTokenValid = (token?: string): boolean => {
  if (!token) return false;

  try {
    const decoded: IJWToken = jwt_decode(token);
    return (new Date().valueOf() / 1000) < decoded.exp;
  } catch (e) {
    return false;
  }
};

const canRefreshToken = (token?: ITokens): boolean => {
  if (!token || !token.id_token || !token.refresh_ttl) return false;

  try {
    const decoded: IJWToken = jwt_decode(token.id_token);
    return (decoded.iat + token.refresh_ttl) > (new Date().valueOf() / 1000);
  } catch (e) {
    return false;
  }
}

const willTokenExpire = (token?: string): boolean => {
  if (!token) return true;

  try {
    const decoded: IJWToken = jwt_decode(token);
    // Will the token expire in the next hour?
    return (new Date().valueOf() / 1000) + 3600 > decoded.exp;
  } catch (e) {
    return true;
  }
};

const isAccessTokenValid = (token?: IToken) => isTokenValid(token?.access_token);
const isRefreshTokenValid = (token?: IToken) => isTokenValid(token?.refresh_token);

const getApiKey = async (provider: string) => {
  try {
    const {headers} = await axios.post(urlBuilder(API_KEY_URL, provider));
    return headers['api-key'];
  } catch (e) {
    console.error(e);
    console.log('Could not get API key');
  }
};

const fixHeaderKey = (headerVal: string, authToken: string = '') => headerVal.replace('{apiKey}', BAM_API_KEY).replace('{accessToken}', authToken);

const makeApiCall = async (endpoint: IEndpoint, body: any, authToken: string = '') => {
  const headers = {};
  let reqBody: any = _.cloneDeep(body);

  Object.entries(endpoint.headers).forEach(([key, value]) => {
    headers[key] = fixHeaderKey(value, authToken);
  });

  if (
    headers['Content-Type'] === 'application/x-www-form-urlencoded' ||
    headers['content-type'] === 'application/x-www-form-urlencoded'
  ) {
    reqBody = new url.URLSearchParams(reqBody).toString()
  }

  if (endpoint.method === 'POST') {
    const {data} = await axios.post(endpoint.href, reqBody, {headers});
    return data;
  } else {
    const {data} = await axios.get(endpoint.href, {headers});
    return data;
  }
};

interface IJWToken {
  exp: number;
  iat: number;
  [key: string]: string | number;
}

interface IEndpoint {
  href: string;
  headers: {
    [key: string]: string;
  };
  method: 'POST' | 'GET';
}

interface IAppConfig {
  services: {
    account: {
      client: {
        endpoints: {
          createAccountGrant: IEndpoint;
        }
      }
    }
    token: {
      client: {
        endpoints: {
          exchange: IEndpoint;
        }
      }
    }
    device: {
      client: {
        endpoints: {
          createAccountGrant: IEndpoint;
          createDeviceGrant: IEndpoint;
        }
      }
    }
  }
}

export interface IToken {
  access_token: string;
  refresh_token: string;
}

export interface IGrant {
  grant_type: string;
  assertion: string;
}

export interface ITokens extends IToken {
  ttl: number;
  refresh_ttl: number;
  swid: string;
  id_token: string;
}

class EspnHandler {
  public tokens?: ITokens;
  public account_token?: IToken;
  public device_token_exchange?: IToken;
  public device_refresh_token?: IToken;
  public device_grant?: IGrant;
  public id_token_grant?: IGrant;

  private appConfig: IAppConfig;
  private graphQlApiKey: string;

  public initialize = async () => {
    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    if (!this.tokens || !isTokenValid(this.tokens.id_token)) {
      if (canRefreshToken(this.tokens)) {
        await this.refreshTokens();
      } else {
        await this.startAuthFlow();
      }
    }
  };

  public refreshTokens = async () => {
    if (!isTokenValid(this.tokens.id_token) || willTokenExpire(this.tokens.id_token)) {
      console.log('Refreshing auth token');
      await this.refreshAuth();
    }

    if (!this.device_token_exchange || !isTokenValid(this.device_token_exchange.access_token) || willTokenExpire(this.device_token_exchange.access_token)) {
      console.log('Refreshing device token');
      await this.getDeviceTokenExchange(true);
    }

    if (!this.device_refresh_token || !isTokenValid(this.device_refresh_token.access_token) || willTokenExpire(this.device_refresh_token.access_token)) {
      console.log('Refreshing device refresh token');
      await this.getDeviceRefreshToken(true);
    }

    if (!this.account_token || !isTokenValid(this.account_token.access_token) || willTokenExpire(this.account_token.access_token)) {
      console.log('Refreshing BAM access token');
      await this.getBamAccessToken(true);
    }
  };

  public getLiveEvents = async (useEspn3?: boolean) => {
    await this.getGraphQlApiKey();

    let networks = 'null';
    let packages = '["espn_plus"]';

    if (useEspn3) {
      networks = '["3e99c57a-516c-385d-9c22-2e40aebc7129"]';
      packages = 'null'
    };

    const query = 'query Airings ( $countryCode: String!, $deviceType: DeviceType!, $tz: String!, $type: AiringType, $categories: [String], $networks: [String], $packages: [String], $eventId: String, $packageId: String, $start: String, $end: String, $day: String, $limit: Int ) { airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: $type, categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { id airingId simulcastAiringId name type startDateTime shortDate: startDate(style: SHORT) authTypes adobeRSS duration feedName purchaseImage { url } image { url } network { id type abbreviation name shortName adobeResource isIpAuth } source { url authorizationType hasPassThroughAds hasNielsenWatermarks hasEspnId3Heartbeats commercialReplacement } packages { name } category { id name } subcategory { id name } sport { id name abbreviation code } league { id name abbreviation code } franchise { id name } program { id code categoryCode isStudio } tracking { nielsenCrossId1 nielsenCrossId2 comscoreC6 trackingId } } }';
    const variables = `{"deviceType":"DESKTOP","countryCode":"US","tz":"UTC+0000","type":"LIVE","networks":${networks},"packages":${packages},"limit":500}`;

    const {data: entryData} = await axios.get(encodeURI(`https://watch.graph.api.espn.com/api?apiKey=${this.graphQlApiKey}&query=${query}&variables=${variables}`));
    return entryData.data.airings;
  };

  public getUpcomingEvents = async (date: string, useEspn3?: boolean) => {
    await this.getGraphQlApiKey();

    let networks = 'null';
    let packages = '["espn_plus"]';

    if (useEspn3) {
      networks = '["3e99c57a-516c-385d-9c22-2e40aebc7129"]';
      packages = 'null'
    };

    const query = 'query Airings ( $countryCode: String!, $deviceType: DeviceType!, $tz: String!, $type: AiringType, $categories: [String], $networks: [String], $packages: [String], $eventId: String, $packageId: String, $start: String, $end: String, $day: String, $limit: Int ) { airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: $type, categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { id airingId simulcastAiringId name type startDateTime shortDate: startDate(style: SHORT) authTypes adobeRSS duration feedName purchaseImage { url } image { url } network { id type abbreviation name shortName adobeResource isIpAuth } source { url authorizationType hasPassThroughAds hasNielsenWatermarks hasEspnId3Heartbeats commercialReplacement } packages { name } category { id name } subcategory { id name } sport { id name abbreviation code } league { id name abbreviation code } franchise { id name } program { id code categoryCode isStudio } tracking { nielsenCrossId1 nielsenCrossId2 comscoreC6 trackingId } } }';
    const variables = `{"deviceType":"DESKTOP","countryCode":"US","tz":"UTC+0000","type":"UPCOMING","networks":${networks},"packages":${packages},"day":"${date}","limit":500}`;

    const {data: entryData} = await axios.get(encodeURI(`https://watch.graph.api.espn.com/api?apiKey=${this.graphQlApiKey}&query=${query}&variables=${variables}`));
    return entryData.data.airings;
  };

  public getEventData = async (eventId: string): Promise<[string, string]> => {
    await this.getBamAccessToken();
    await this.getGraphQlApiKey();

    try {
      const {data: scenarios} = await axios.get('https://watch.graph.api.espn.com/api', {
        params: {
          apiKey: this.graphQlApiKey,
          query: `{airing(id:"${eventId}",countryCode:"us",deviceType:SETTOP,tz:"Z") {id name description mrss:adobeRSS authTypes requiresLinearPlayback status:type startDateTime endDateTime duration source(authorization: SHIELD) { url authorizationType hasEspnId3Heartbeats hasNielsenWatermarks hasPassThroughAds commercialReplacement startSessionUrl } network { id type name adobeResource } image { url } sport { name code uid } league { name uid } program { code categoryCode isStudio } seekInSeconds simulcastAiringId airingId tracking { nielsenCrossId1 trackingId } eventId packages { name } language tier feedName brands { id name type }}}`
        },
      });

      if (!scenarios?.data?.airing?.source?.url.length || scenarios?.data?.airing?.status !== 'LIVE') {
        console.log('Event status: ', scenarios?.data?.airing?.status);
        throw new Error('No streaming data available');
      }

      const scenarioUrl = scenarios.data.airing.source.url.replace('{scenario}', 'browser~ssai');

      const {data} = await axios.get(scenarioUrl, {
        headers: {
          Authorization: this.account_token.access_token,
          Accept: 'application/vnd.media-service+json; version=2',
          'User-Agent': userAgent,
          Origin: 'https://plus.espn.com',
        }
      });

      const uri = data.stream.slide ? data.stream.slide : data.stream.complete;

      return [
        uri,
        this.account_token.access_token,
      ];
    } catch (e) {
      console.error(e);
      console.log('Could not get stream data. Event might be upcoming, ended, or in blackout...');
    }
  };

  public refreshAuth = async (): Promise<void> => {
    try {
      const {data: refreshTokenData} = await axios.post(urlBuilder(REFRESH_AUTH_URL, ANDROID_ID), {
        refreshToken: this.tokens.refresh_token,
      });

      this.tokens = refreshTokenData.data.token;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get auth refresh token');
    }
  };

  private startAuthFlow = async (): Promise<void> => {
    const apiKey = await getApiKey(ANDROID_ID);

    try {
      const {data: licensePlate} = await axios.post(urlBuilder(LICENSE_PLATE_URL, ANDROID_ID), {
        adId: getRandomHex(),
        'correlation-id': getRandomHex(),
        deviceId: getRandomHex(),
        deviceType: 'ANDTV',
        entitlementPath: 'login',
        entitlements: [],
      }, {
        headers: {
          Authorization: `APIKEY ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      const {data: wsInfo} = await axios.get(`${licensePlate.data.fastCastHost}/public/websockethost`);

      return new Promise((resolve, reject) => {
        const client = new Sockette(`wss://${wsInfo.ip}:${wsInfo.securePort}/FastcastService/pubsub/profiles/${licensePlate.data.fastCastProfileId}?TrafficManager-Token=${wsInfo.token}`, {
          timeout: 5e3,
          maxAttempts: 10,
          onmessage: e => {
            const wsData = JSON.parse(e.data);

            if (wsData.op) {
              if (wsData.op === 'C') {
                client.json({
                  op: 'S',
                  sid: wsData.sid,
                  tc: licensePlate.data.fastCastTopic,
                  rc: 200,
                });
              } else if (wsData.op === 'P') {
                this.tokens = JSON.parse(wsData.pl);

                this.save();
                client.close();
                resolve();
              }
            }
          },
          onopen: () => {
            console.log('Please open a browser window and go to: https://www.espn.com/watch/activate');
            console.log('Enter code: ', licensePlate.data.pairingCode);

            client.json({
              op: 'C',
            })
          },
          onerror: e => {
            console.error(e);
            console.log('Could not start the authentication process!');

            client.close();
            reject();
          }
        });
      });
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process!');
    }
  };

  private getAppConfig = async () => {
    try {
      const {data} = await axios.get<IAppConfig>(BAM_APP_CONFIG);
      this.appConfig = data;
    } catch (e) {
      console.error(e);
      console.log('Could not load API app config');
    }
  };

  private getGraphQlApiKey = async () => {
    if (!this.graphQlApiKey) {
      try {
        const { data: espnKeys } = await axios.get('https://a.espncdn.com/connected-devices/app-configurations/espn-js-sdk-web-2.0.config.json');
        this.graphQlApiKey = espnKeys.graphqlapi.apiKey;
      } catch (e) {
        console.error(e);
        console.log('Could not get GraphQL API key');
      }
    }
  }

  private createDeviceGrant = async () => {
    if (!this.device_grant || !isTokenValid(this.device_grant.assertion)) {
      try {
        this.device_grant = await makeApiCall(this.appConfig.services.device.client.endpoints.createDeviceGrant, {
          deviceFamily: 'browser',
          applicationRuntime: 'chrome',
          deviceProfile: 'linux',
          attributes: {}
        });

        this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get device grant');
      }
    }
  };

  private createAccountGrant = async () => {
    await this.getDeviceRefreshToken();

    if (!this.id_token_grant || !isTokenValid(this.id_token_grant.assertion)) {
      try {
        this.id_token_grant = await makeApiCall(this.appConfig.services.account.client.endpoints.createAccountGrant, {
          id_token: this.tokens.id_token,
        }, this.device_refresh_token.access_token);

        this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get account grant');
      }
    }
  };

  private getDeviceTokenExchange = async (force?: boolean) => {
    await this.createDeviceGrant();

    if (!this.device_token_exchange || !isRefreshTokenValid(this.device_token_exchange) || force) {
      try {
        this.device_token_exchange = await makeApiCall(this.appConfig.services.token.client.endpoints.exchange, {
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          latitude: 0,
          longitude: 0,
          platform: 'browser',
          setCookie: false,
          subject_token: this.device_grant.assertion,
          subject_token_type: 'urn:bamtech:params:oauth:token-type:device'
        });

        this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get device token exchange');
      }
    }
  };

  private getDeviceRefreshToken = async (force?: boolean) => {
    await this.getDeviceTokenExchange();

    if (!this.device_refresh_token || !isAccessTokenValid(this.device_refresh_token) || force) {
      try {
        this.device_refresh_token = await makeApiCall(this.appConfig.services.token.client.endpoints.exchange, {
          grant_type: 'refresh_token',
          latitude: 0,
          longitude: 0,
          platform: 'browser',
          setCookie: false,
          refresh_token: this.device_token_exchange.refresh_token,
        });

        this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get device token exchange');
      }
    }
  };

  private getBamAccessToken = async (force?: boolean) => {
    await this.createAccountGrant();

    if (!this.account_token || !isAccessTokenValid(this.account_token) || force) {
      try {
        this.account_token = await makeApiCall(this.appConfig.services.token.client.endpoints.exchange, {
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          latitude: 0,
          longitude: 0,
          platform: 'browser',
          setCookie: false,
          subject_token: this.id_token_grant.assertion,
          subject_token_type: 'urn:bamtech:params:oauth:token-type:account'
        });

        this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get BAM access token');
      }
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'tokens.json'), _.omit(this, 'appConfig', 'graphQlApiKey'), {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'tokens.json'))) {
      const {
        tokens,
        device_grant,
        device_token_exchange,
        device_refresh_token,
        id_token_grant,
        account_token,
      } = fsExtra.readJSONSync(path.join(configPath, 'tokens.json'));

      this.tokens = tokens;
      this.device_grant = device_grant;
      this.device_token_exchange = device_token_exchange;
      this.device_refresh_token = device_refresh_token;
      this.id_token_grant = id_token_grant;
      this.account_token = account_token;
    }
  }
}

export const espnHandler = new EspnHandler();