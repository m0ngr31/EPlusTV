import fs from 'fs';
import https from 'https';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import Sockette from 'sockette';
import ws from 'ws';
import jwt_decode from 'jwt-decode';
import _ from 'lodash';
import url from 'url';
import moment from 'moment';

import {userAgent} from './user-agent';
import {configPath} from './config';
import {
  useEspnPlus,
  requiresEspnProvider,
  useAccN,
  useAccNx,
  useEspn1,
  useEspn2,
  useEspn3,
  useEspnU,
  useSec,
  useSecPlus,
  useEspnPpv,
  useEspnews,
} from './networks';
import {IAdobeAuth, willAdobeTokenExpire, createAdobeAuthHeader} from './adobe-helpers';
import {getRandomHex} from './shared-helpers';
import {ClassTypeWithoutMethods, IEntry, IHeaders, IJWToken, IProvider} from './shared-interfaces';
import {db} from './database';
import {useLinear} from './channels';
import {debug} from './debug';

global.WebSocket = ws;

const espnPlusTokens = path.join(configPath, 'espn_plus_tokens.json');
const espnLinearTokens = path.join(configPath, 'espn_linear_tokens.json');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// For `watch.graph.api.espn.com` URLs
const instance = axios.create({
  httpsAgent,
});

interface IAuthResources {
  [key: string]: boolean;
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
        };
      };
    };
    token: {
      client: {
        endpoints: {
          exchange: IEndpoint;
        };
      };
    };
    device: {
      client: {
        endpoints: {
          createAccountGrant: IEndpoint;
          createDeviceGrant: IEndpoint;
        };
      };
    };
  };
}

interface IToken {
  access_token: string;
  refresh_token: string;
}

interface IGrant {
  grant_type: string;
  assertion: string;
}

interface ITokens extends IToken {
  ttl: number;
  refresh_ttl: number;
  swid: string;
  id_token: string;
}

export interface IEspnPlusMeta {
  use_ppv?: boolean;
}

export interface IEspnMeta {
  sec_plus?: boolean;
  accnx?: boolean;
  espn3?: boolean;
}

const ADOBE_KEY = ['g', 'B', '8', 'H', 'Y', 'd', 'E', 'P', 'y', 'e', 'z', 'e', 'Y', 'b', 'R', '1'].join('');

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

const ANDROID_ID = 'ESPN-OTT.GC.ANDTV-PROD';

const DISNEY_ROOT_URL = 'https://registerdisney.go.com/jgc/v6/client';
const API_KEY_URL = '/{id-provider}/api-key?langPref=en-US';
const LICENSE_PLATE_URL = '/{id-provider}/license-plate';
const REFRESH_AUTH_URL = '/{id-provider}/guest/refresh-auth?langPref=en-US';

const BAM_API_KEY = 'ZXNwbiZicm93c2VyJjEuMC4w.ptUt7QxsteaRruuPmGZFaJByOoqKvDP2a5YkInHrc7c';
const BAM_APP_CONFIG =
  'https://bam-sdk-configs.bamgrid.com/bam-sdk/v2.0/espn-a9b93989/browser/v3.4/linux/chrome/prod.json';

const LINEAR_NETWORKS = ['espn1', 'espn2', 'espnu', 'sec', 'acc', 'espnews'];

const urlBuilder = (endpoint: string, provider: string) =>
  `${DISNEY_ROOT_URL}${endpoint}`.replace('{id-provider}', provider);

const isTokenValid = (token?: string): boolean => {
  if (!token) return false;

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

const fixHeaderKey = (headerVal: string, authToken = '') =>
  headerVal.replace('{apiKey}', BAM_API_KEY).replace('{accessToken}', authToken);

const makeApiCall = async (endpoint: IEndpoint, body: any, authToken = '') => {
  const headers = {};
  let reqBody: any = _.cloneDeep(body);

  Object.entries(endpoint.headers).forEach(([key, value]) => {
    headers[key] = fixHeaderKey(value, authToken);
  });

  if (
    headers['Content-Type'] === 'application/x-www-form-urlencoded' ||
    headers['content-type'] === 'application/x-www-form-urlencoded'
  ) {
    reqBody = new url.URLSearchParams(reqBody).toString();
  }

  if (endpoint.method === 'POST') {
    const {data} = await axios.post(endpoint.href, reqBody, {headers});
    return data;
  } else {
    const {data} = await axios.get(endpoint.href, {headers});
    return data;
  }
};

const getNetworkInfo = (network?: string) => {
  let networks = 'null';
  let packages = '["espn_plus"]';

  if (network === 'espn1') {
    networks = '["e748f3c0-3f7c-3088-a90a-0ccb2588e0ed"]';
    packages = 'null';
  } else if (network === 'espn2') {
    networks = '["017f41a2-ef4f-39d3-9f45-f680b88cd23b"]';
    packages = 'null';
  } else if (network === 'espn3') {
    networks = '["3e99c57a-516c-385d-9c22-2e40aebc7129"]';
    packages = 'null';
  } else if (network === 'espnU') {
    networks = '["500b1f7c-dad5-33f9-907c-87427babe201"]';
    packages = 'null';
  } else if (network === 'secn') {
    networks = '["74459ca3-cf85-381d-b90d-a95ff6e7a207"]';
    packages = 'null';
  } else if (network === 'secnPlus') {
    networks = '["19644d95-cc83-38ed-bdf9-50b9f2e9ebfc"]';
    packages = 'null';
  } else if (network === 'accn') {
    networks = '["76b92674-175c-4ff1-8989-380aa514eb87"]';
    packages = 'null';
  } else if (network === 'accnx') {
    networks = '["9f538e0b-a896-3325-a417-79034e03a248"]';
    packages = 'null';
  } else if (network === 'espnews') {
    networks = '["1e760a1c-c204-339d-8317-8e615c9cc0e0"]';
    packages = 'null';
  } else if (network === 'espn_ppv') {
    networks = '["d41c5aaf-e100-4726-841f-1e453af347f9"]';
    packages = 'null';
  }

  return [networks, packages];
};

class WebSocketPlus {
  public wsToken?: ITokens;
  private wsClient?: Sockette;

  public closeWebSocket = (): void => {
    if (this.wsClient) {
      try {
        this.wsClient.close();
        this.wsClient = undefined;
      } catch (e) {}
    }

    this.wsToken = undefined;
  };

  public initializeWebSocket = (wsUrl: string, licensePlate: any): void => {
    this.closeWebSocket();

    this.wsClient = new Sockette(wsUrl, {
      maxAttempts: 10,
      onerror: e => {
        console.error(e);
        console.log('Could not start authentication for ESPN+');

        this.closeWebSocket();
      },
      onmessage: e => {
        const wsData = JSON.parse(e.data);

        if (wsData.op) {
          if (wsData.op === 'C') {
            this.wsClient.json({
              op: 'S',
              rc: 200,
              sid: wsData.sid,
              tc: licensePlate.data.fastCastTopic,
            });
          } else if (wsData.op === 'P') {
            this.wsToken = JSON.parse(wsData.pl);
          }
        }
      },
      onopen: () => {
        this.wsClient.json({
          op: 'C',
        });
      },
      timeout: 5e3,
    });
  };
}

const wsPlus = new WebSocketPlus();

const authorizedResources: IAuthResources = {};

const parseCategories = event => {
  const categories = ['ESPN'];
  for (const classifier of [event.category, event.subcategory, event.sport, event.league]) {
    if (classifier !== null && classifier.name !== null) {
      categories.push(classifier.name);
    }
  }

  return [...new Set(categories)];
};

const parseAirings = async events => {
  const now = moment();
  const endSchedule = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.id});

    if (!entryExists) {
      const isLinear = useLinear && event.network?.id && LINEAR_NETWORKS.find(n => n === event.network?.id);

      const start = moment(event.startDateTime);
      const end = moment(event.startDateTime).add(event.duration, 'seconds').add(1, 'hour');
      const xmltvEnd = moment(event.startDateTime).add(event.duration, 'seconds');

      if (!isLinear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now) || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.name);

      await db.entries.insert<IEntry>({
        categories: parseCategories(event),
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        feed: event.feedName,
        from: 'espn',
        id: event.id,
        image: event.image?.url,
        name: event.name,
        network: event.network?.name || 'ESPN+',
        sport: event.subcategory?.name,
        start: start.valueOf(),
        url: event.source?.url,
        ...(isLinear && {
          channel: event.network?.id,
          linear: true,
        }),
        xmltvEnd: xmltvEnd.valueOf(),
      });
    }
  }
};

const isEnabled = async (which?: string): Promise<boolean> => {
  const {enabled: espnPlusEnabled, meta: plusMeta} = await db.providers.findOne<
    IProvider<TESPNPlusTokens, IEspnPlusMeta>
  >({name: 'espnplus'});
  const {
    enabled: espnLinearEnabled,
    linear_channels,
    meta: linearMeta,
  } = await db.providers.findOne<IProvider<TESPNTokens, IEspnMeta>>({name: 'espn'});

  if (which === 'linear') {
    return espnLinearEnabled && _.some(linear_channels, c => c.enabled);
  } else if (which === 'plus') {
    return espnPlusEnabled;
  } else if (which === 'ppv') {
    return (plusMeta?.use_ppv ? true : false) && espnPlusEnabled;
  } else if (which === 'espn3') {
    return (linearMeta?.espn3 ? true : false) && espnLinearEnabled;
  } else if (which === 'sec_plus') {
    return (linearMeta?.sec_plus ? true : false) && espnLinearEnabled;
  } else if (which === 'accnx') {
    return (linearMeta?.accnx ? true : false) && espnLinearEnabled;
  }

  return espnPlusEnabled || (espnLinearEnabled && _.some(linear_channels, c => c.enabled));
};

class EspnHandler {
  public tokens?: ITokens;
  public account_token?: IToken;
  public device_token_exchange?: IToken;
  public device_refresh_token?: IToken;
  public device_grant?: IGrant;
  public id_token_grant?: IGrant;

  public adobe_device_id?: string;
  public adobe_auth?: IAdobeAuth;

  private appConfig: IAppConfig;
  private graphQlApiKey: string;

  public initialize = async () => {
    const setupPlus = (await db.providers.count({name: 'espnplus'})) > 0 ? true : false;

    if (!setupPlus) {
      const data: TESPNPlusTokens = {};

      if (useEspnPlus) {
        this.loadJSON();

        data.tokens = this.tokens;
        data.device_grant = this.device_grant;
        data.device_token_exchange = this.device_token_exchange;
        data.device_refresh_token = this.device_refresh_token;
        data.id_token_grant = this.id_token_grant;
        data.account_token = this.account_token;
      }

      await db.providers.insert<IProvider<TESPNPlusTokens, IEspnPlusMeta>>({
        enabled: useEspnPlus,
        meta: {
          use_ppv: useEspnPpv,
        },
        name: 'espnplus',
        tokens: data,
      });

      if (fs.existsSync(espnPlusTokens)) {
        fs.rmSync(espnPlusTokens);
      }
    }

    const setupLinear = (await db.providers.count({name: 'espn'})) > 0 ? true : false;

    if (!setupLinear) {
      const data: TESPNTokens = {};

      if (requiresEspnProvider) {
        this.loadJSON();

        data.adobe_device_id = this.adobe_device_id;
        data.adobe_auth = this.adobe_auth;
      }

      await db.providers.insert<IProvider<TESPNTokens, IEspnMeta>>({
        enabled: requiresEspnProvider,
        linear_channels: [
          {
            enabled: useEspn1,
            id: 'espn1',
            name: 'ESPN',
            tmsId: '32645',
          },
          {
            enabled: useEspn2,
            id: 'espn2',
            name: 'ESPN2',
            tmsId: '45507',
          },
          {
            enabled: useEspnU,
            id: 'espnu',
            name: 'ESPNU',
            tmsId: '60696',
          },
          {
            enabled: useSec,
            id: 'sec',
            name: 'SEC Network',
            tmsId: '89714',
          },
          {
            enabled: useAccN,
            id: 'acc',
            name: 'ACC Network',
            tmsId: '111871',
          },
          {
            enabled: useEspnews,
            id: 'espnews',
            name: 'ESPNews',
            tmsId: '59976',
          },
        ],
        meta: {
          accnx: useAccNx,
          espn3: useEspn3,
          sec_plus: useSecPlus,
        },
        name: 'espn',
        tokens: data,
      });

      if (fs.existsSync(espnLinearTokens)) {
        fs.rmSync(espnLinearTokens);
      }
    }

    if (useEspnPpv) {
      console.log('Using ESPN_PPV variable is no longer needed. Please use the UI going forward');
    }
    if (useEspn1) {
      console.log('Using ESPN variable is no longer needed. Please use the UI going forward');
    }
    if (useEspn2) {
      console.log('Using ESPN2 variable is no longer needed. Please use the UI going forward');
    }
    if (useEspn3) {
      console.log('Using ESPN3 variable is no longer needed. Please use the UI going forward');
    }
    if (useEspnU) {
      console.log('Using ESPNU variable is no longer needed. Please use the UI going forward');
    }
    if (useSec) {
      console.log('Using SEC variable is no longer needed. Please use the UI going forward');
    }
    if (useSecPlus) {
      console.log('Using SECPLUS variable is no longer needed. Please use the UI going forward');
    }
    if (useAccN) {
      console.log('Using ACCN variable is no longer needed. Please use the UI going forward');
    }
    if (useAccNx) {
      console.log('Using ACCNX variable is no longer needed. Please use the UI going forward');
    }
    if (useEspnews) {
      console.log('Using ESPNEWS variable is no longer needed. Please use the UI going forward');
    }

    const enabled = await isEnabled();

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();

    if (!this.appConfig) {
      await this.getAppConfig();
    }
  };

  public refreshTokens = async () => {
    const espnPlusEnabled = await isEnabled('plus');

    if (espnPlusEnabled) {
      await this.updatePlusTokens();
    }

    const espnLinearEnabled = await isEnabled('linear');

    if (espnLinearEnabled && willAdobeTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (ESPN)');
      await this.refreshProviderToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const espnPlusEnabled = await isEnabled('plus');
    const espnPpvEnabled = await isEnabled('ppv');
    const espnLinearEnabled = await isEnabled('linear');
    const secPlusEnabled = await isEnabled('sec_plus');
    const espn3Enabled = await isEnabled('espn3');
    const accnxEnabled = await isEnabled('accnx');

    const {linear_channels} = await db.providers.findOne<IProvider>({name: 'espn'});

    const isChannelEnabled = (channelId: string): boolean =>
      espnLinearEnabled && linear_channels.some(c => c.id === channelId && c.enabled);

    let entries = [];

    try {
      if (espnPlusEnabled) {
        console.log('Looking for ESPN+ events...');

        const liveEntries = await this.getLiveEvents();
        entries = [...entries, ...liveEntries];
      }

      if (espnLinearEnabled) {
        console.log('Looking for ESPN events');
      }

      if (isChannelEnabled('espn1')) {
        const liveEntries = await this.getLiveEvents('espn1');
        entries = [...entries, ...liveEntries];
      }
      if (isChannelEnabled('espn2')) {
        const liveEntries = await this.getLiveEvents('espn2');
        entries = [...entries, ...liveEntries];
      }
      if (espn3Enabled) {
        const liveEntries = await this.getLiveEvents('espn3');
        entries = [...entries, ...liveEntries];
      }
      if (isChannelEnabled('espnu')) {
        const liveEntries = await this.getLiveEvents('espnU');
        entries = [...entries, ...liveEntries];
      }
      if (isChannelEnabled('sec')) {
        const liveEntries = await this.getLiveEvents('secn');
        entries = [...entries, ...liveEntries];
      }
      if (secPlusEnabled) {
        const liveEntries = await this.getLiveEvents('secnPlus');
        entries = [...entries, ...liveEntries];
      }
      if (isChannelEnabled('acc')) {
        const liveEntries = await this.getLiveEvents('accn');
        entries = [...entries, ...liveEntries];
      }
      if (accnxEnabled) {
        const liveEntries = await this.getLiveEvents('accnx');
        entries = [...entries, ...liveEntries];
      }
      if (isChannelEnabled('espnews')) {
        const liveEntries = await this.getLiveEvents('espnews');
        entries = [...entries, ...liveEntries];
      }
      if (espnPpvEnabled) {
        const liveEntries = await this.getLiveEvents('espn_ppv');
        entries = [...entries, ...liveEntries];
      }
    } catch (e) {
      console.log('Could not parse ESPN events');
    }

    const today = new Date();

    for (const [i] of [0, 1, 2].entries()) {
      const date = moment(today).add(i, 'days');

      try {
        if (espnPlusEnabled) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'));
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('espn1')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn1');
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('espn2')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn2');
          entries = [...entries, ...upcomingEntries];
        }
        if (espn3Enabled) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn3');
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('espnu')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espnU');
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('sec')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'secn');
          entries = [...entries, ...upcomingEntries];
        }
        if (secPlusEnabled) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'secnPlus');
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('acc')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'accn');
          entries = [...entries, ...upcomingEntries];
        }
        if (accnxEnabled) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'accnx');
          entries = [...entries, ...upcomingEntries];
        }
        if (isChannelEnabled('espnews')) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espnews');
          entries = [...entries, ...upcomingEntries];
        }
        if (espnPpvEnabled) {
          const upcomingEntries = await this.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn_ppv');
          entries = [...entries, ...upcomingEntries];
        }
      } catch (e) {
        console.log('Could not parse ESPN events');
      }
    }

    try {
      await parseAirings(entries);
    } catch (e) {
      console.log('Could not parse events');
    }
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
    const espnPlusEnabled = await isEnabled('plus');
    espnPlusEnabled && (await this.getBamAccessToken());
    espnPlusEnabled && (await this.getGraphQlApiKey());

    try {
      const {data: scenarios} = await instance.get('https://watch.graph.api.espn.com/api', {
        params: {
          apiKey: this.graphQlApiKey,
          query: `{airing(id:"${eventId}",countryCode:"us",deviceType:SETTOP,tz:"Z") {id name description mrss:adobeRSS authTypes requiresLinearPlayback status:type startDateTime endDateTime duration source(authorization: SHIELD) { url authorizationType hasEspnId3Heartbeats hasNielsenWatermarks hasPassThroughAds commercialReplacement startSessionUrl } network { id type name adobeResource } image { url } sport { name code uid } league { name uid } program { code categoryCode isStudio } seekInSeconds simulcastAiringId airingId tracking { nielsenCrossId1 trackingId } eventId packages { name } language tier feedName brands { id name type }}}`,
        },
      });

      if (!scenarios?.data?.airing?.source?.url.length || scenarios?.data?.airing?.status !== 'LIVE') {
        console.log('Event status: ', scenarios?.data?.airing?.status);
        throw new Error('No streaming data available');
      }

      const scenarioUrl = scenarios.data.airing.source.url.replace('{scenario}', 'browser~ssai');

      let isEspnPlus = true;
      let headers: IHeaders = {};
      let uri: string;

      if (scenarios?.data?.airing?.source?.authorizationType === 'SHIELD') {
        // console.log('Scenario: ', scenarios?.data?.airing);
        isEspnPlus = false;
      }

      if (isEspnPlus) {
        const {data} = await axios.get(scenarioUrl, {
          headers: {
            Accept: 'application/vnd.media-service+json; version=2',
            Authorization: this.account_token.access_token,
            Origin: 'https://plus.espn.com',
            'User-Agent': userAgent,
          },
        });

        uri = data.stream.slide ? data.stream.slide : data.stream.complete;
        headers = {
          Authorization: this.account_token.access_token,
        };
      } else {
        let tokenType = 'DEVICE';
        let token = this.adobe_device_id;

        if (_.some(scenarios?.data?.airing?.authTypes, (authType: string) => authType.toLowerCase() === 'mvpd')) {
          // Try to get the media token, but if it fails, let's just try device authentication
          try {
            await this.authorizeEvent(eventId, scenarios?.data?.airing?.mrss);

            const mediaTokenUrl = [
              'https://',
              'api.auth.adobe.com',
              '/api/v1',
              '/mediatoken',
              '?requestor=ESPN',
              `&deviceId=${this.adobe_device_id}`,
              `&resource=${encodeURIComponent(scenarios?.data?.airing?.mrss)}`,
            ].join('');

            const {data} = await axios.get(mediaTokenUrl, {
              headers: {
                Authorization: createAdobeAuthHeader('GET', mediaTokenUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY),
                'User-Agent': userAgent,
              },
            });

            tokenType = 'ADOBEPASS';
            token = data.serializedToken;
          } catch (e) {
            console.error(e);
            console.log('could not get mediatoken');
          }
        }

        // Get stream data
        const authenticatedUrl = [
          `https://broadband.espn.com/espn3/auth/watchespn/startSession?channel=${scenarios?.data?.airing?.network?.id}&simulcastAiringId=${scenarios?.data?.airing?.simulcastAiringId}`,
          '&partner=watchespn',
          '&playbackScenario=HTTP_CLOUD_HIGH',
          '&platform=chromecast_uplynk',
          '&v=2.0.0',
          `&token=${token}`,
          `&tokenType=${tokenType}`,
          `&resource=${Buffer.from(scenarios?.data?.airing?.mrss, 'utf-8').toString('base64')}`,
        ].join('');

        const {data: authedData} = await axios.get(authenticatedUrl, {
          headers: {
            'User-Agent': userAgent,
          },
        });

        uri = authedData?.session?.playbackUrls?.default;
        headers = {
          Connection: 'keep-alive',
          Cookie: `_mediaAuth: ${authedData?.session?.token}`,
          'User-Agent': userAgent,
        };
      }

      return [uri, headers];
    } catch (e) {
      // console.error(e);
      console.log('Could not get stream data. Event might be upcoming, ended, or in blackout...');
    }
  };

  public refreshAuth = async (): Promise<void> => {
    try {
      const {data: refreshTokenData} = await axios.post(urlBuilder(REFRESH_AUTH_URL, ANDROID_ID), {
        refreshToken: this.tokens.refresh_token,
      });

      this.tokens = refreshTokenData.data.token;
      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get auth refresh token');
    }
  };

  private updatePlusTokens = _.throttle(
    async () => {
      if (!isTokenValid(this.tokens?.id_token) || willTokenExpire(this.tokens?.id_token)) {
        console.log('Refreshing auth token (ESPN+)');
        await this.refreshAuth();
      }

      if (
        !this.device_token_exchange ||
        !isTokenValid(this.device_token_exchange.access_token) ||
        willTokenExpire(this.device_token_exchange.access_token)
      ) {
        console.log('Refreshing device token (ESPN+)');
        await this.getDeviceTokenExchange(true);
      }

      if (
        !this.device_refresh_token ||
        !isTokenValid(this.device_refresh_token.access_token) ||
        willTokenExpire(this.device_refresh_token.access_token)
      ) {
        console.log('Refreshing device refresh token (ESPN+)');
        await this.getDeviceRefreshToken(true);
      }

      if (
        !this.account_token ||
        !isTokenValid(this.account_token.access_token) ||
        willTokenExpire(this.account_token.access_token)
      ) {
        console.log('Refreshing BAM access token (ESPN+)');
        await this.getBamAccessToken(true);
      }
    },
    60 * 1000,
    {leading: true, trailing: false},
  );

  private getLiveEvents = async (network?: string) => {
    await this.getGraphQlApiKey();

    const [networks, packages] = getNetworkInfo(network);

    const query =
      'query Airings ( $countryCode: String!, $deviceType: DeviceType!, $tz: String!, $type: AiringType, $categories: [String], $networks: [String], $packages: [String], $eventId: String, $packageId: String, $start: String, $end: String, $day: String, $limit: Int ) { airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: $type, categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { id airingId simulcastAiringId name type startDateTime shortDate: startDate(style: SHORT) authTypes adobeRSS duration feedName purchaseImage { url } image { url } network { id type abbreviation name shortName adobeResource isIpAuth } source { url authorizationType hasPassThroughAds hasNielsenWatermarks hasEspnId3Heartbeats commercialReplacement } packages { name } category { id name } subcategory { id name } sport { id name abbreviation code } league { id name abbreviation code } franchise { id name } program { id code categoryCode isStudio } tracking { nielsenCrossId1 nielsenCrossId2 comscoreC6 trackingId } } }';
    const variables = `{"deviceType":"DESKTOP","countryCode":"US","tz":"UTC+0000","type":"LIVE","networks":${networks},"packages":${packages},"limit":500}`;

    const {data: entryData} = await instance.get(
      encodeURI(
        `https://watch.graph.api.espn.com/api?apiKey=${this.graphQlApiKey}&query=${query}&variables=${variables}`,
      ),
    );

    debug.saveRequestData(entryData, network || 'espn+', 'live-epg');

    return entryData.data.airings;
  };

  private getUpcomingEvents = async (date: string, network?: string) => {
    await this.getGraphQlApiKey();

    const [networks, packages] = getNetworkInfo(network);

    const query =
      'query Airings ( $countryCode: String!, $deviceType: DeviceType!, $tz: String!, $type: AiringType, $categories: [String], $networks: [String], $packages: [String], $eventId: String, $packageId: String, $start: String, $end: String, $day: String, $limit: Int ) { airings( countryCode: $countryCode, deviceType: $deviceType, tz: $tz, type: $type, categories: $categories, networks: $networks, packages: $packages, eventId: $eventId, packageId: $packageId, start: $start, end: $end, day: $day, limit: $limit ) { id airingId simulcastAiringId name type startDateTime shortDate: startDate(style: SHORT) authTypes adobeRSS duration feedName purchaseImage { url } image { url } network { id type abbreviation name shortName adobeResource isIpAuth } source { url authorizationType hasPassThroughAds hasNielsenWatermarks hasEspnId3Heartbeats commercialReplacement } packages { name } category { id name } subcategory { id name } sport { id name abbreviation code } league { id name abbreviation code } franchise { id name } program { id code categoryCode isStudio } tracking { nielsenCrossId1 nielsenCrossId2 comscoreC6 trackingId } } }';
    const variables = `{"deviceType":"DESKTOP","countryCode":"US","tz":"UTC+0000","type":"UPCOMING","networks":${networks},"packages":${packages},"day":"${date}","limit":500}`;

    const {data: entryData} = await instance.get(
      encodeURI(
        `https://watch.graph.api.espn.com/api?apiKey=${this.graphQlApiKey}&query=${query}&variables=${variables}`,
      ),
    );

    debug.saveRequestData(entryData, network || 'espn+', 'upcoming-epg');

    return entryData.data.airings;
  };

  private authorizeEvent = async (eventId: string, mrss: string): Promise<void> => {
    if (mrss && authorizedResources[eventId]) {
      return;
    }

    const authorizeEventTokenUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1',
      '/authorize',
      '?requestor=ESPN',
      `&deviceId=${this.adobe_device_id}`,
      `&resource=${encodeURIComponent(mrss)}`,
    ].join('');

    try {
      await axios.get(authorizeEventTokenUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', authorizeEventTokenUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY),
          'User-Agent': userAgent,
        },
      });

      authorizedResources[eventId] = true;
    } catch (e) {
      console.error(e);
      console.log('Could not authorize event. Might be blacked out or not available from your TV provider');
    }
  };

  public getLinearAuthCode = async (): Promise<string> => {
    if (!this.appConfig) {
      await this.getAppConfig();
    }

    this.adobe_device_id = getRandomHex();

    const regUrl = ['https://', 'api.auth.adobe.com', '/reggie/', 'v1/', 'ESPN', '/regcode'].join('');

    try {
      const {data} = await axios.post(
        regUrl,
        new url.URLSearchParams({
          deviceId: this.adobe_device_id,
          deviceType: 'android_tv',
          ttl: '1800',
        }).toString(),
        {
          headers: {
            Authorization: createAdobeAuthHeader('POST', regUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY),
            'User-Agent': userAgent,
          },
        },
      );

      return data.code;
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process!');
    }
  };

  public authenticateLinearRegCode = async (regcode: string): Promise<boolean> => {
    const regUrl = ['https://', 'api.auth.adobe.com', '/api/v1/', 'authenticate/', regcode, '?requestor=ESPN'].join('');

    try {
      const {data} = await axios.get<IAdobeAuth>(regUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', regUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY),
          'User-Agent': userAgent,
        },
      });

      this.adobe_auth = data;
      await this.save();

      return true;
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error(e);
        console.log('Could not get provider token data!');
      }

      return false;
    }
  };

  private refreshProviderToken = async (): Promise<void> => {
    const renewUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1/',
      'tokens/authn',
      '?requestor=ESPN',
      `&deviceId=${this.adobe_device_id}`,
    ].join('');

    try {
      const {data} = await axios.get<IAdobeAuth>(renewUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', renewUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY),
          'User-Agent': userAgent,
        },
      });

      this.adobe_auth = data;
      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh provider token data!');
    }
  };

  public getPlusAuthCode = async (): Promise<string> => {
    if (!this.appConfig) {
      await this.getAppConfig();
    }

    const apiKey = await getApiKey(ANDROID_ID);

    try {
      const {data: licensePlate} = await axios.post(
        urlBuilder(LICENSE_PLATE_URL, ANDROID_ID),
        {
          adId: getRandomHex(),
          'correlation-id': getRandomHex(),
          deviceId: getRandomHex(),
          deviceType: 'ANDTV',
          entitlementPath: 'login',
          entitlements: [],
        },
        {
          headers: {
            Authorization: `APIKEY ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const {data: wsInfo} = await axios.get(`${licensePlate.data.fastCastHost}/public/websockethost`);

      wsPlus.initializeWebSocket(
        `wss://${wsInfo.ip}:${wsInfo.securePort}/FastcastService/pubsub/profiles/${licensePlate.data.fastCastProfileId}?TrafficManager-Token=${wsInfo.token}`,
        licensePlate,
      );

      setTimeout(() => wsPlus.closeWebSocket(), 5 * 60 * 1000);

      return licensePlate.data.pairingCode;
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process!');
    }
  };

  public authenticatePlusRegCode = async (): Promise<boolean> => {
    if (wsPlus.wsToken) {
      this.tokens = wsPlus.wsToken;

      await this.save();

      wsPlus.closeWebSocket();
      return true;
    }

    return false;
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
        const {data: espnKeys} = await axios.get(
          'https://a.espncdn.com/connected-devices/app-configurations/espn-js-sdk-web-2.0.config.json',
        );
        this.graphQlApiKey = espnKeys.graphqlapi.apiKey;
      } catch (e) {
        console.error(e);
        console.log('Could not get GraphQL API key');
      }
    }
  };

  private createDeviceGrant = async () => {
    if (!this.device_grant || !isTokenValid(this.device_grant.assertion)) {
      try {
        this.device_grant = await makeApiCall(this.appConfig.services.device.client.endpoints.createDeviceGrant, {
          applicationRuntime: 'chrome',
          attributes: {},
          deviceFamily: 'browser',
          deviceProfile: 'linux',
        });

        await this.save();
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
        this.id_token_grant = await makeApiCall(
          this.appConfig.services.account.client.endpoints.createAccountGrant,
          {
            id_token: this.tokens.id_token,
          },
          this.device_refresh_token.access_token,
        );

        await this.save();
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
          subject_token_type: 'urn:bamtech:params:oauth:token-type:device',
        });

        await this.save();
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
          refresh_token: this.device_token_exchange.refresh_token,
          setCookie: false,
        });

        await this.save();
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
          subject_token_type: 'urn:bamtech:params:oauth:token-type:account',
        });

        await this.save();
      } catch (e) {
        console.error(e);
        console.log('Could not get BAM access token');
      }
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.update(
      {name: 'espnplus'},
      {$set: {tokens: _.omit(this, 'appConfig', 'graphQlApiKey', 'adobe_auth', 'adobe_device_id')}},
    );

    await db.providers.update({name: 'espn'}, {$set: {tokens: _.pick(this, 'adobe_auth', 'adobe_device_id')}});
  };

  private load = async (): Promise<void> => {
    const {tokens: plusTokens} = await db.providers.findOne<IProvider<TESPNPlusTokens>>({name: 'espnplus'});
    const {tokens, device_grant, device_token_exchange, device_refresh_token, id_token_grant, account_token} =
      plusTokens;

    this.tokens = tokens;
    this.device_grant = device_grant;
    this.device_token_exchange = device_token_exchange;
    this.device_refresh_token = device_refresh_token;
    this.id_token_grant = id_token_grant;
    this.account_token = account_token;

    const {tokens: linearTokens} = await db.providers.findOne<IProvider<TESPNTokens>>({name: 'espn'});
    const {adobe_device_id, adobe_auth} = linearTokens;

    this.adobe_device_id = adobe_device_id;
    this.adobe_auth = adobe_auth;
  };

  private loadJSON = () => {
    if (fs.existsSync(espnPlusTokens)) {
      const {tokens, device_grant, device_token_exchange, device_refresh_token, id_token_grant, account_token} =
        fsExtra.readJSONSync(espnPlusTokens);

      this.tokens = tokens;
      this.device_grant = device_grant;
      this.device_token_exchange = device_token_exchange;
      this.device_refresh_token = device_refresh_token;
      this.id_token_grant = id_token_grant;
      this.account_token = account_token;
    }

    if (fs.existsSync(espnLinearTokens)) {
      const {adobe_device_id, adobe_auth} = fsExtra.readJSONSync(espnLinearTokens);

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
    }
  };
}

export type TESPNPlusTokens = Omit<ClassTypeWithoutMethods<EspnHandler>, 'adobe_device_id' | 'adobe_auth'>;
export type TESPNTokens = Pick<ClassTypeWithoutMethods<EspnHandler>, 'adobe_device_id' | 'adobe_auth'>;

export const espnHandler = new EspnHandler();
