import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import moment, {Moment} from 'moment-timezone';

import {okHttpUserAgent, userAgent, androidMlbUserAgent} from './user-agent';
import {configPath} from './config';
import {useBigInning, useMLBtv} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';
import {useLinear} from './channels';

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
  '3',
  'e',
  '1',
  'n',
  'u',
  't',
  'A',
  '1',
  'H',
  'L',
  'z',
  'A',
  'K',
  'G',
  '3',
  '5',
  '6',
].join('');

const parseDateAndTime = (dateString: string, timeString: string): Moment => {
  // Combine date and time strings
  const dateTimeString = `${dateString} ${timeString}`;

  // Parse the combined string and set the time zone to Eastern
  const dateTime = moment.tz(dateTimeString, 'M/DD/YYYY h:mm A', 'America/New_York');

  // Check if the parsed date is valid
  if (!dateTime.isValid()) {
    throw new Error('Invalid date or time format');
  }

  return dateTime;
};

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

const parseBigInnings = async (dates: Moment[][]) => {
  const now = moment();
  const endDate = moment().add(2, 'days');

  for (const day of dates) {
    const [start, end] = day;
    const gameName = `Big Inning - ${start.format('dddd, MMMM Do YYYY')}`;

    const entryExists = await db.entries.findOne<IEntry>({id: gameName});

    if (start.isAfter(endDate) || end.isBefore(now) || entryExists) {
      continue;
    }

    console.log('Adding event: ', gameName);

    await db.entries.insert<IEntry>({
      categories: ['Baseball', 'MLB', 'Big Inning'],
      duration: end.diff(start, 'seconds'),
      end: end.valueOf(),
      from: 'mlbtv',
      id: gameName,
      image: 'https://i.imgur.com/8JHoeFA.png',
      name: gameName,
      network: 'MLBTVBI',
      sport: 'MLB',
      start: start.valueOf(),
      ...(useLinear && {
        channel: 'MLBTVBI',
        linear: true,
      }),
    });
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
  public refresh_token?: string;
  public expires_at?: number;
  public access_token?: string;
  public session_id?: string;

  public initialize = async () => {
    if (!useMLBtv) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.access_token || !this.expires_at) {
      await this.startProviderAuthFlow();
      await this.refreshToken();
    }
  };

  public refreshTokens = async () => {
    if (!useMLBtv) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(30, 'minutes'))) {
      await this.refreshToken();
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

      if (useBigInning) {
        const bigInnings = await this.getBigInnings();
        await parseBigInnings(bigInnings);
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

      if (mediaId.indexOf('Big Inning - ') > -1) {
        const streamInfoUrl = await this.getBigInningInfo();
        const streamUrl = await this.getBigInningStream(streamInfoUrl);

        return [streamUrl, {}];
      }

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

  private getBigInningInfo = async (): Promise<string> => {
    try {
      const url = ['https://', 'dapi.mlbinfra.com', '/v2', '/content', '/en-us', '/vsmcontents', '/big-inning'].join(
        '',
      );

      const {data} = await axios.get(url, {
        headers: {
          'User-Agent': androidMlbUserAgent,
        },
      });

      if (data.references?.video.length > 0) {
        return data.references.video[0].fields.url;
      } else {
        throw new Error('Big Inning data not ready yet');
      }
    } catch (e) {
      console.error(e);
      console.log('Big Inning data not ready yet');
    }
  };

  private getBigInningStream = async (url: string): Promise<string> => {
    try {
      const {data} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          'User-Agent': androidMlbUserAgent,
        },
      });

      return data.data[0].value;
    } catch (e) {
      console.error(e);
      console.log('Could not get Big Inning stream info');
    }
  };

  private getBigInnings = async (): Promise<Moment[][]> => {
    const bigInnings: Moment[][] = [];

    try {
      const {data} = await axios.get(
        'https://www.mlb.com/live-stream-games/help-center/subscription-access-big-inning',
      );

      const $ = cheerio.load(data);
      const table = $('table');

      table.find('tr').each((_, row) => {
        const rowData = [];

        $(row)
          .find('td')
          .each((_, cell) => {
            rowData.push($(cell).text().trim());
          });

        if (rowData.length > 0) {
          const [dateString, startTimeString, endTimeString] = rowData;

          const startDateTime = parseDateAndTime(dateString, startTimeString);
          const endDateTime = parseDateAndTime(dateString, endTimeString);

          bigInnings.push([startDateTime, endDateTime]);
        }
      });

      return bigInnings;
    } catch (e) {
      console.error(e);
      console.log('Could not get Big Inning data');
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

  private refreshToken = async (): Promise<void> => {
    try {
      const url = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/token';
      const headers = {
        'User-Agent': androidMlbUserAgent,
        'accept-language': 'en',
        'content-type': 'application/x-www-form-urlencoded',
      };

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: this.refresh_token,
        scope: 'offline_access openid profile',
      });

      const {data} = await axios.post(url, params, {
        headers,
      });

      this.access_token = data.access_token;
      this.expires_at = moment().add(data.expires_in, 'seconds').valueOf();
      this.refresh_token = data.refresh_token;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get refresh token for MLB.tv');
    }
  };

  private authenticateRegCode = async (): Promise<boolean> => {
    try {
      const url = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/token';
      const headers = {
        'User-Agent': androidMlbUserAgent,
        'accept-language': 'en',
        'content-type': 'application/x-www-form-urlencoded',
      };

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: this.device_id,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });

      const {data} = await axios.post(url, params, {
        headers,
      });

      this.access_token = data.access_token;
      this.expires_at = moment().add(data.expires_in, 'seconds').valueOf();
      this.refresh_token = data.refresh_token;
      this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const url = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/device/authorize';
      const headers = {
        'User-Agent': androidMlbUserAgent,
        'accept-language': 'en',
        'content-type': 'application/x-www-form-urlencoded',
      };

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        scope: 'openid profile offline_access',
      });

      const {data} = await axios.post(url, params, {
        headers,
      });

      this.device_id = data.device_code;
      this.save();

      console.log('=== MLB.tv Auth ===');
      console.log('Please open a browser window and go to: https://ids.mlb.com/activate');
      console.log('Enter code: ', data.user_code);
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
      console.log('Could not start the authentication process for MLB.tv');
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
      const {device_id, access_token, expires_at, refresh_token} = fsExtra.readJSONSync(
        path.join(configPath, 'mlb_tokens.json'),
      );

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
    }
  };
}

export const mlbHandler = new MLBHandler();
