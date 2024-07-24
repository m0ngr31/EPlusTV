import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import moment from 'moment';
import crypto from 'crypto';

import {okHttpUserAgent, userAgent, oktaUserAgent} from './user-agent';
import {configPath} from './config';
import {useMLBtv} from './networks';
import {getRandomUUID} from './shared-helpers';
import {IEntry, IHeaders, IJWToken} from './shared-interfaces';
import {db} from './database';

interface IGameContent {
  media: {
    epg: {
      title: string;
      items: {
        callLetters: string;
        espnAuthRequired: boolean;
        tbsAuthRequired: boolean;
        espn2AuthRequired: boolean;
        contentId: string;
        fs1AuthRequired: boolean;
        mediaId: string;
        mediaFeedType: string;
        mlbnAuthRequired: boolean;
        foxAuthRequired: boolean;
        freeGame: boolean;
        id: number;
        abcAuthRequired: boolean;
      }[];
    }[];
    freeGame: boolean;
    enhancedGame: boolean;
  };
}

interface ITeam {
  team: {
    name: string;
    id: number;
  };
}

interface IGame {
  gamePk: number;
  description: string;
  gameDate: string;
  teams: {
    away: ITeam;
    home: ITeam;
  };
  content: IGameContent;
}

interface ISchedule {
  dates: {
    games: IGame[];
  }[];
}

interface IVideoFeed {
  mediaId: string;
  mediaFeedType: string;
  callLetters: string;
  freeGame: boolean;
}

interface IGameFeed {
  gamePk: string;
  videoFeeds: IVideoFeed[];
}

interface ICombinedGame {
  [key: string]: {
    feed?: IGameFeed;
    entry?: IGame;
  };
}

const CLIENT_ID = [
  '0',
  'o',
  'a',
  'p',
  '7',
  'w',
  'a',
  '8',
  '5',
  '7',
  'j',
  'c',
  'v',
  'P',
  'l',
  'Z',
  '5',
  '3',
  '5',
  '5',
].join('');

const generateThumb = (home: ITeam, away: ITeam): string =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/ar_167:215,c_crop/fl_relative,l_team:${home.team.id}:fill:spot.png,w_1.0,h_1,x_0.5,y_0,fl_no_overflow,e_distort:100p:0:200p:0:200p:100p:0:100p/fl_relative,l_team:${away.team.id}:logo:spot:current,w_0.38,x_-0.25,y_-0.16/fl_relative,l_team:${home.team.id}:logo:spot:current,w_0.38,x_0.25,y_0.16/w_750/team/${away.team.id}/fill/spot.png`;

const parseAirings = async (events: ICombinedGame) => {
  const now = moment();

  for (const pk in events) {
    if (!events[pk].feed || !events[pk].entry) {
      continue;
    }

    const event = events[pk].entry;
    const eventFeed = events[pk].feed;

    for (const epg of eventFeed.videoFeeds) {
      if (epg.mediaId) {
        const entryExists = await db.entries.findOne<IEntry>({id: epg.mediaId});

        if (!entryExists) {
          if (process.env.MLBTV_ONLY_FREE?.toLowerCase() === 'true' && !epg.freeGame) {
            continue;
          }

          const start = moment(event.gameDate);
          const end = moment(event.gameDate).add(5, 'hours');

          if (end.isBefore(now)) {
            continue;
          }

          const gameName = `${event.teams.away.team.name} @ ${event.teams.home.team.name} - ${epg.mediaFeedType}`;

          console.log('Adding event: ', gameName);

          await db.entries.insert<IEntry>({
            categories: ['Baseball', 'MLB', event.teams.home.team.name, event.teams.away.team.name],
            duration: end.diff(start, 'seconds'),
            end: end.valueOf(),
            from: 'mlbtv',
            id: epg.mediaId,
            image: generateThumb(event.teams.home, event.teams.away),
            name: gameName,
            network: epg.callLetters,
            sport: 'MLB',
            start: start.valueOf(),
          });
        }
      }
    }
  }
};

const willAuthTokenExpire = (token?: string): boolean => {
  if (!token) return true;

  try {
    const decoded: IJWToken = jwt_decode(token);
    // Will the token expire in the next 5 hours?
    return Math.floor(new Date().valueOf() / 1000) + 3600 * 5 > decoded.exp;
  } catch (e) {
    return true;
  }
};

const COMMON_HEADERS = {
  'cache-control': 'no-cache',
  origin: 'https://www.mlb.com',
  pragma: 'no-cache',
  priority: 'u=1, i',
  referer: 'https://www.mlb.com/',
  'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': userAgent,
};

class MLBHandler {
  public device_id?: string;
  public code_verifier?: string;
  public access_token?: string;
  public password_id?: string;
  public session_id?: string;
  public interaction_handle?: string;
  public interaction_code?: string;
  public introspect_state_handle?: string;
  public identify_state_handle?: string;

  public initialize = async () => {
    if (!useMLBtv) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = getRandomUUID();
      this.save();
    }

    if (!this.access_token || willAuthTokenExpire(this.access_token)) {
      await this.login();
    }
  };

  public refreshTokens = async () => {
    if (!useMLBtv) {
      return;
    }

    if (willAuthTokenExpire(this.access_token)) {
      await this.login();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useMLBtv) {
      return;
    }

    console.log('Looking for MLB.tv events...');

    try {
      const entries = await this.getEvents();
      const feeds = await this.getFeeds();

      const combinedEntries: ICombinedGame = {};

      for (const feed of feeds) {
        if (!combinedEntries[feed.gamePk]) {
          combinedEntries[feed.gamePk] = {};
        }

        combinedEntries[feed.gamePk] = {
          ...combinedEntries[feed.gamePk],
          feed,
        };
      }

      for (const entry of entries) {
        if (!combinedEntries[entry.gamePk]) {
          combinedEntries[entry.gamePk] = {};
        }

        combinedEntries[entry.gamePk] = {
          ...combinedEntries[entry.gamePk],
          entry,
        };
      }

      await parseAirings(combinedEntries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse MLB.tv events');
    }
  };

  public getEventData = async (mediaId: string): Promise<[string, IHeaders]> => {
    try {
      await this.getSession();

      const url = 'https://media-gateway.mlb.com/graphql';
      const headers = {
        accept: 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.5',
        authorization: 'Bearer ' + this.access_token,
        connection: 'keep-alive',
        'content-type': 'application/json',
        'x-client-name': 'WEB',
        'x-client-version': '7.8.1',
      };

      const params = {
        operationName: 'initPlaybackSession',
        query:
          'mutation initPlaybackSession(\n        $adCapabilities: [AdExperienceType]\n        $mediaId: String!\n        $deviceId: String!\n        $sessionId: String!\n        $quality: PlaybackQuality\n    ) {\n        initPlaybackSession(\n            adCapabilities: $adCapabilities\n            mediaId: $mediaId\n            deviceId: $deviceId\n            sessionId: $sessionId\n            quality: $quality\n        ) {\n            playbackSessionId\n            playback {\n                url\n                token\n                expiration\n                cdn\n            }\n            adScenarios {\n                adParamsObj\n                adScenarioType\n                adExperienceType\n            }\n            adExperience {\n                adExperienceTypes\n                adEngineIdentifiers {\n                    name\n                    value\n                }\n                adsEnabled\n            }\n            heartbeatInfo {\n                url\n                interval\n            }\n            trackingObj\n        }\n    }',
        variables: {
          adCapabilities: ['NONE'],
          deviceId: this.device_id,
          mediaId,
          quality: 'PLACEHOLDER',
          sessionId: this.session_id,
        },
      };

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      const playbackUrl = data.data.initPlaybackSession.playback.url.replace(/[/]([A-Za-z0-9_]+)[/]/g, '/');
      const token = data.data.initPlaybackSession.playback.token;

      return [
        playbackUrl,
        {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'en-US,en;q=0.5',
          connection: 'keep-alive',
          'x-cdn-token': token,
        },
      ];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private getEvents = async (): Promise<any[]> => {
    let entries = [];

    try {
      const startDate = moment();
      const endDate = moment().add(2, 'days').endOf('day');

      const url = [
        'https://statsapi.mlb.com',
        '/api/v1/schedule',
        '?hydrate=game(content(media(all))),team,flags,gameInfo',
        '&sportId=1',
        `&startDate=${startDate.format('YYYY-MM-DD')}`,
        `&endDate=${endDate.format('YYYY-MM-DD')}`,
      ].join('');

      const {data} = await axios.get<ISchedule>(url, {
        headers: {
          'User-Agent': okHttpUserAgent,
        },
      });

      data.dates.forEach(date => (entries = [...entries, ...date.games]));
    } catch (e) {
      throw new Error(e);
    }

    return entries;
  };

  private getFeeds = async (): Promise<IGameFeed[]> => {
    try {
      const startDate = moment();
      const endDate = moment().add(2, 'days').endOf('day');

      const url = [
        'https://mastapi.mobile.mlbinfra.com/api/epg/v3/search?exp=MLB',
        `&startDate=${startDate.format('YYYY-MM-DD')}`,
        `&endDate=${endDate.format('YYYY-MM-DD')}`,
      ].join('');

      const {data} = await axios.get<{results: IGameFeed[]}>(url, {
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
        },
      });

      return data.results;
    } catch (e) {
      throw new Error(e);
    }
  };

  private getInteractionHandle = async (): Promise<void> => {
    try {
      const url = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/interact';
      const headers = {
        accept: 'application/json',
        'accept-language': 'en',
        'content-type': 'application/x-www-form-urlencoded',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      if (!this.code_verifier) {
        this.code_verifier = crypto.randomBytes(22).toString('hex').slice(0, -1);
        this.save();
      }

      // Generate code challenge
      const codeChallenge = crypto
        .createHash('sha256')
        .update(this.code_verifier)
        .digest()
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce: crypto.randomBytes(32).toString('base64url'),
        redirect_uri: 'https://www.mlb.com/login',
        scope: 'openid email',
        state: crypto.randomBytes(32).toString('base64url'),
      });

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      this.interaction_handle = data.interaction_handle;
    } catch (e) {
      console.error(e);
      console.log('Could not get interaction handle!');
    }
  };

  private getIntrospectStateHandle = async (): Promise<void> => {
    await this.getInteractionHandle();

    try {
      const url = 'https://ids.mlb.com/idp/idx/introspect';
      const headers = {
        accept: 'application/ion+json; okta-version=1.0.0',
        'accept-language': 'en',
        'content-type': 'application/ion+json; okta-version=1.0.0',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      const params = {
        interactionHandle: this.interaction_handle,
      };

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      this.introspect_state_handle = data.stateHandle;
    } catch (e) {
      console.error(e);
      console.log('Could not get introspect state handle!');
    }
  };

  private getIdentifyStateHandle = async (): Promise<void> => {
    await this.getIntrospectStateHandle();

    try {
      const url = 'https://ids.mlb.com/idp/idx/identify';
      const headers = {
        accept: 'application/ion+json; okta-version=1.0.0',
        'accept-language': 'en',
        'content-type': 'application/json',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      const params = {
        identifier: process.env.MLBTV_USER,
        rememberMe: true,
        stateHandle: this.introspect_state_handle,
      };

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      this.identify_state_handle = data.stateHandle;

      data.authenticators.value.forEach((authenticator: {type: string; id: string}) => {
        if (authenticator.type === 'password') {
          this.password_id = authenticator.id;
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not get identify');
    }
  };

  private getChallenge = async (): Promise<void> => {
    await this.getIdentifyStateHandle();

    try {
      const url = 'https://ids.mlb.com/idp/idx/challenge';
      const headers = {
        accept: 'application/ion+json; okta-version=1.0.0',
        'accept-language': 'en',
        'content-type': 'application/json',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      const params = {
        authenticator: {
          id: this.password_id,
        },
        stateHandle: this.identify_state_handle,
      };

      await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });
    } catch (e) {
      console.error(e);
      console.log('Could not get challenge');
    }
  };

  private getAnswer = async (): Promise<void> => {
    await this.getChallenge();

    try {
      const url = 'https://ids.mlb.com/idp/idx/challenge/answer';
      const headers = {
        accept: 'application/ion+json; okta-version=1.0.0',
        'accept-language': 'en',
        'content-type': 'application/json',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      const params = {
        credentials: {
          passcode: process.env.MLBTV_PASS,
        },
        stateHandle: this.identify_state_handle,
      };

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      data.successWithInteractionCode.value.forEach((code: {name: string; value: string}) => {
        if (code.name === 'interaction_code') {
          this.interaction_code = code.value;
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not get answer');
    }
  };

  private login = async (): Promise<void> => {
    await this.getAnswer();

    try {
      const url = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/token';
      const headers = {
        accept: 'application/json',
        'accept-language': 'en',
        'content-type': 'application/x-www-form-urlencoded',
        'x-okta-user-agent-extended': oktaUserAgent,
      };

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        code_verifier: this.code_verifier,
        grant_type: 'interaction_code',
        interaction_code: this.interaction_code,
        redirect_uri: 'https://www.mlb.com/login',
      });

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      this.access_token = data.access_token;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not login');
    }
  };

  private getSession = async (): Promise<void> => {
    try {
      const url = 'https://media-gateway.mlb.com/graphql';
      const headers = {
        accept: 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.5',
        authorization: 'Bearer ' + this.access_token,
        connection: 'keep-alive',
        'content-type': 'application/json',
        'x-client-name': 'WEB',
        'x-client-version': '7.8.1',
      };

      const params = {
        operationName: 'initSession',
        query:
          'mutation initSession($device: InitSessionInput!, $clientType: ClientType!, $experience: ExperienceTypeInput) {\n    initSession(device: $device, clientType: $clientType, experience: $experience) {\n        deviceId\n        sessionId\n        entitlements {\n            code\n        }\n        location {\n            countryCode\n            regionName\n            zipCode\n            latitude\n            longitude\n        }\n        clientExperience\n        features\n    }\n  }',
        variables: {
          clientType: 'WEB',
          device: {
            appVersion: '7.8.1',
            deviceFamily: 'desktop',
            knownDeviceId: this.device_id,
            languagePreference: 'ENGLISH',
            manufacturer: 'Apple',
            model: 'Macintosh',
            os: 'macos',
            osVersion: '10.15',
          },
        },
      };

      const {data} = await axios.post(url, params, {
        headers: {
          ...COMMON_HEADERS,
          ...headers,
        },
      });

      this.session_id = data.data.initSession.sessionId;
    } catch (e) {
      console.error(e);
      console.log('Could not get session id');
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'mlb_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'mlb_tokens.json'))) {
      const {device_id, access_token, code_verifier} = fsExtra.readJSONSync(path.join(configPath, 'mlb_tokens.json'));

      this.device_id = device_id;
      this.access_token = access_token;
      this.code_verifier = code_verifier;
    }
  };
}

export const mlbHandler = new MLBHandler();
