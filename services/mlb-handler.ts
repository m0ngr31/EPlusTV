import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import moment, {Moment} from 'moment-timezone';
import _ from 'lodash';

import {okHttpUserAgent, userAgent, androidMlbUserAgent} from './user-agent';
import {configPath} from './config';
import {useMLBtv, useMLBtvOnlyFree} from './networks';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {usesLinear} from './misc-db-service';
import {isBase64, normalTimeRange} from './shared-helpers';

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

interface IMLBNetworkEvent {
  utcDate: string;
  originalShowSynopsis: string;
  synopsis: string;
  episodetitle: string;
  seriestitle: string;
  live: string;
  startdate: string;
  starttime: string;
  enddate: string;
  endtime: string;
}

type TSNYEvent = [string, string, string, string, string];

interface ISNYSchedule {
  [key: string]: {
    title: string;
    data: {
      rows: TSNYEvent[];
    };
  };
}

interface ISNLAProgram {
  thumbnail: string;
  title: string;
}

interface ISNLAEvent {
  startTime: number;
  endTime: number;
  programId: string;
  id: string;
}

interface ISNLAEventCombined extends ISNLAEvent, ISNLAProgram {}

interface ISNLAScheduleRes {
  programs: {
    [key: string]: ISNLAProgram;
  };
  events: ISNLAEvent[];
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
  blackedOutVideo?: boolean;
  videoFeeds: IVideoFeed[];
}

interface ICombinedGame {
  [key: string]: {
    feed?: IGameFeed;
    entry?: IGame;
  };
}

interface IProviderMeta {
  onlyFree?: boolean;
}

interface IEntitlement {
  code: string;
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

const GRAPHQL_URL = ['https://', 'media-gateway.mlb.com', '/graphql'].join('');

const LINEAR_CHANNELS = [
  {
    enabled: false,
    id: 'MLBTVBI',
    name: 'MLB Big Inning',
    tmsId: '119153',
  },
  {
    enabled: false,
    id: 'MLBN',
    name: 'MLB Network',
    tmsId: '62079',
  },
  {
    enabled: false,
    id: 'SNY',
    name: 'SportsNet New York',
    stationId: '49603',
  },
  {
    enabled: false,
    id: 'SNLA',
    name: 'Spectrum SportsNet LA HD',
    stationId: '87024',
  },
];

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
  const [now, endDate] = normalTimeRange();

  const {meta} = await db.providers.findOneAsync<IProvider<TMLBTokens, IProviderMeta>>({name: 'mlbtv'});
  const onlyFree = meta?.onlyFree ?? false;

  for (const pk in events) {
    if (!events[pk].feed || !events[pk].entry || events[pk].feed.blackedOutVideo) {
      continue;
    }

    const event = events[pk].entry;
    const eventFeed = events[pk].feed;

    for (const epg of eventFeed.videoFeeds) {
      if (epg.mediaId) {
        const entryExists = await db.entries.findOneAsync<IEntry>({id: epg.mediaId});

        if (!entryExists) {
          if (onlyFree && !epg.freeGame) {
            continue;
          }

          const start = moment(event.gameDate);
          const end = moment(event.gameDate).add(4, 'hours');
          const originalEnd = moment(event.gameDate).add(3, 'hours');

          if (end.isBefore(now) || start.isAfter(endDate)) {
            continue;
          }

          const gameName = `${event.teams.away.team.name} @ ${event.teams.home.team.name} - ${epg.mediaFeedType}`;

          console.log('Adding event: ', gameName);

          await db.entries.insertAsync<IEntry>({
            categories: ['Baseball', 'MLB', event.teams.home.team.name, event.teams.away.team.name],
            duration: end.diff(start, 'seconds'),
            end: end.valueOf(),
            from: 'mlbtv',
            id: epg.mediaId,
            image: generateThumb(event.teams.home, event.teams.away),
            name: gameName,
            network: epg.callLetters,
            originalEnd: originalEnd.valueOf(),
            sport: 'MLB',
            start: start.valueOf(),
          });
        }
      }
    }
  }
};

const parseBigInnings = async (dates: Moment[][]) => {
  const useLinear = await usesLinear();

  const [now, endDate] = normalTimeRange();

  for (const day of dates) {
    const [start, end] = day;
    const gameName = `Big Inning - ${start.format('dddd, MMMM Do YYYY')}`;

    const entryExists = await db.entries.findOneAsync<IEntry>({id: gameName});

    if (start.isAfter(endDate) || end.isBefore(now) || entryExists) {
      continue;
    }

    console.log('Adding event: ', gameName);

    await db.entries.insertAsync<IEntry>({
      categories: ['Baseball', 'MLB', 'Big Inning'],
      duration: end.diff(start, 'seconds'),
      end: end.valueOf(),
      from: 'mlbtv',
      id: gameName,
      image: 'https://tmsimg.fancybits.co/assets/s119153_ll_h15_aa.png?w=360&h=270',
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

const parseMlbNetwork = async (events: IMLBNetworkEvent[]): Promise<void> => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    const entryExists = await db.entries.findOneAsync<IEntry>({id: `MLB Network - ${event.utcDate}`});

    if (!entryExists) {
      const start = moment(`${event.startdate} ${event.starttime}`, 'MM/DD/YYYY h:mm A');
      const end = moment(`${event.enddate} ${event.endtime}`, 'MM/DD/YYYY h:mm A');

      const duration = moment.duration(end.diff(start)).asSeconds();

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      let name = 'MLB Network Event';

      if (event.episodetitle && event.seriestitle) {
        name = `${event.seriestitle}: ${event.episodetitle}`;
      } else if ((!event.episodetitle || event.episodetitle.length === 0) && event.seriestitle) {
        name = event.seriestitle;
      }

      console.log('Adding event: ', name);

      await db.entries.insertAsync<IEntry>({
        categories: ['MLB Network', 'MLB', 'Baseball'],
        channel: 'MLBN',
        duration,
        end: end.valueOf(),
        from: 'mlbtv',
        id: `MLB Network - ${event.utcDate}`,
        image: 'https://tmsimg.fancybits.co/assets/s62079_ll_h15_aa.png?w=360&h=270',
        linear: true,
        name,
        network: 'MLBN',
        sport: 'MLB',
        start: start.valueOf(),
      });
    }
  }
};

const parseSny = async (events: TSNYEvent[]): Promise<void> => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    const [, date, startTime, endTime, name] = event;

    const eventStart = moment.tz(`${date} ${startTime}`, 'MM/DD/YYYY hh:mm A', 'America/New_York').startOf('minute');
    const entryExists = await db.entries.findOneAsync<IEntry>({id: `SNY - ${eventStart.valueOf()}`});

    if (!entryExists) {
      const start = moment(eventStart);
      const end = moment.tz(`${date} ${endTime}`, 'MM/DD/YYYY hh:mm A', 'America/New_York').startOf('minute');

      if (startTime.includes('PM') && endTime.includes('AM')) {
        end.add(1, 'day');
      }

      const duration = moment.duration(end.diff(start)).asSeconds();

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', name);

      await db.entries.insertAsync<IEntry>({
        categories: ['SNY'],
        channel: 'SNY',
        duration,
        end: end.valueOf(),
        from: 'mlbtv',
        id: `SNY - ${eventStart.valueOf()}`,
        image: 'https://tmsimg.fancybits.co/assets/s49603_ll_h9_aa.png?w=360&h=270',
        linear: true,
        name,
        network: 'SNY',
        sport: 'MLB',
        start: start.valueOf(),
      });
    }
  }
};

const parseSnla = async (events: ISNLAEventCombined[]): Promise<void> => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    const entryExists = await db.entries.findOneAsync<IEntry>({id: `SNLA - ${event.startTime}`});

    if (!entryExists) {
      const start = moment(event.startTime);
      const end = moment(event.endTime);

      const duration = moment.duration(end.diff(start)).asSeconds();

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insertAsync<IEntry>({
        categories: ['SNLA'],
        channel: 'SNLA',
        duration,
        end: end.valueOf(),
        from: 'mlbtv',
        id: `SNLA - ${event.startTime}`,
        image: event.thumbnail,
        linear: true,
        name: event.title,
        network: 'SNLA',
        sport: 'MLB',
        start: start.valueOf(),
      });
    }
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

const mlbConfigPath = path.join(configPath, 'mlb_tokens.json');

class MLBHandler {
  public device_id?: string;
  public refresh_token?: string;
  public expires_at?: number;
  public access_token?: string;
  public session_id?: string;
  public entitlements?: IEntitlement[];

  private playback_token?: string;
  private playback_token_exp?: Moment;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'mlbtv'})) > 0 ? true : false;

    if (!setup) {
      const data: TMLBTokens = {};

      if (useMLBtv) {
        this.loadJSON();

        data.access_token = this.access_token;
        data.device_id = this.device_id;
        data.expires_at = this.expires_at;
        data.refresh_token = this.refresh_token;
        data.session_id = this.session_id;
      }

      await db.providers.insertAsync<IProvider<TMLBTokens, IProviderMeta>>({
        enabled: useMLBtv,
        linear_channels: LINEAR_CHANNELS,
        meta: {
          onlyFree: useMLBtvOnlyFree,
        },
        name: 'mlbtv',
        tokens: data,
      });

      if (fs.existsSync(mlbConfigPath)) {
        fs.rmSync(mlbConfigPath);
      }
    }

    if (useMLBtv) {
      console.log('Using MLBTV variable is no longer needed. Please use the UI going forward');
    }
    if (useMLBtvOnlyFree) {
      console.log('Using MLBTV_ONLY_FREE variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});

    if (!enabled) {
      return;
    }

    await this.load();

    // Fix for me being a silly goose!
    const {linear_channels} = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});

    if (linear_channels.length < 4) {
      await db.providers.updateAsync({name: 'mlbtv'}, {$set: {linear_channels: LINEAR_CHANNELS}});

      await this.checkMlbBigInningAccess();
      await this.checkMlbNetworkAccess();
      await this.checkSnyAccess();
      await this.checkSnlaAccess();
    }
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});

    if (!enabled) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(30, 'minutes'))) {
      await this.refreshToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider<TMLBTokens, IProviderMeta>>({name: 'mlbtv'});

    if (!enabled) {
      return;
    }

    console.log('Looking for MLB.tv events...');

    try {
      const entries = await this.getEvents();
      const feeds = await this.getFeeds();

      debug.saveRequestData(entries, 'mlb', 'entries');
      debug.saveRequestData(feeds, 'mlb', 'feeds');

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

      const bigInningsEnabled = await this.checkMlbBigInningAccess();

      if (bigInningsEnabled) {
        const bigInnings = await this.getBigInnings();
        await parseBigInnings(bigInnings);
      }

      const mlbNetworkEnabled = await this.checkMlbNetworkAccess();

      if (mlbNetworkEnabled) {
        const mlbNetworkSchedule = await this.getMlbNetworkSchedule();
        await parseMlbNetwork(mlbNetworkSchedule);
      }

      const snyEnabled = await this.checkSnyAccess();

      if (snyEnabled) {
        const snyEvents = await this.getSnySchedule();
        await parseSny(snyEvents);
      }

      const snlaEnabled = await this.checkSnlaAccess();

      if (snlaEnabled) {
        const snlaEvents = await this.getSnlaSchedule();
        await parseSnla(snlaEvents);
      }
    } catch (e) {
      console.error(e);
      console.log('Could not parse MLB.tv events');
    }
  };

  public getEventData = async (mediaId: string, adCapabilities = 'NONE'): Promise<TChannelPlaybackInfo> => {
    try {
      await this.getSession();

      if (mediaId.indexOf('Big Inning - ') > -1) {
        const streamInfoUrl = await this.getBigInningInfo();
        const streamUrl = await this.getBigInningStream(streamInfoUrl);

        return [streamUrl, {}];
      } else if (mediaId.indexOf('MLB Network - ') > -1) {
        const streamUrl = await this.getMlbNetworkStream();

        return [streamUrl, {}];
      } else if (mediaId.indexOf('SNY - ') > -1) {
        return this.getStream('SNY_LIVE');
      } else if (mediaId.indexOf('SNLA - ') > -1) {
        return this.getStream('SNLA_LIVE');
      }

      const params = {
        operationName: 'initPlaybackSession',
        query:
          'mutation initPlaybackSession(\n        $adCapabilities: [AdExperienceType]\n        $mediaId: String!\n        $deviceId: String!\n        $sessionId: String!\n        $quality: PlaybackQuality\n    ) {\n        initPlaybackSession(\n            adCapabilities: $adCapabilities\n            mediaId: $mediaId\n            deviceId: $deviceId\n            sessionId: $sessionId\n            quality: $quality\n        ) {\n            playbackSessionId\n            playback {\n                url\n                token\n                expiration\n                cdn\n            }\n            adScenarios {\n                adParamsObj\n                adScenarioType\n                adExperienceType\n            }\n            adExperience {\n                adExperienceTypes\n                adEngineIdentifiers {\n                    name\n                    value\n                }\n                adsEnabled\n            }\n            heartbeatInfo {\n                url\n                interval\n            }\n            trackingObj\n        }\n    }',
        variables: {
          adCapabilities: [adCapabilities],
          deviceId: this.device_id,
          mediaId,
          quality: 'PLACEHOLDER',
          sessionId: this.session_id,
        },
      };

      const {data} = await axios.post(GRAPHQL_URL, params, {
        headers: {
          ...COMMON_HEADERS,
          ...this.getGraphQlHeaders(),
        },
      });

      const playbackUrl = data.data.initPlaybackSession.playback.url;
      const token = data.data.initPlaybackSession.playback.token;

      if (token) {
        this.playback_token = token;
        this.playback_token_exp = moment(data.data.initPlaybackSession.playback.expiration);
      }

      return [
        playbackUrl,
        {
          accept: 'application/json, text/plain, */*',
          'accept-encoding': 'identity',
          'accept-language': 'en-US,en;q=0.5',
          connection: 'keep-alive',
        },
      ];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public recheckMlbNetworkAccess = async (): Promise<boolean> => {
    await this.getSession();
    return await this.checkMlbNetworkAccess();
  };

  public recheckSnyAccess = async (): Promise<boolean> => {
    await this.getSession();
    return await this.checkSnyAccess();
  };

  public recheckSnlaAccess = async (): Promise<boolean> => {
    await this.getSession();
    return await this.checkSnlaAccess();
  };

  private updateChannelAccess = async (index: number, enabled: boolean): Promise<void> => {
    const {linear_channels} = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});

    const updatedChannels = linear_channels.map((c, i) => {
      if (i !== index) {
        return c;
      }

      c.enabled = enabled;
      return c;
    });

    await db.providers.updateAsync({name: 'mlbtv'}, {$set: {linear_channels: updatedChannels}});
  };

  private checkMlbBigInningAccess = async (): Promise<boolean> => {
    const {meta} = await db.providers.findOneAsync<IProvider<TMLBTokens, IProviderMeta>>({name: 'mlbtv'});

    const enabled = !meta.onlyFree;

    await this.updateChannelAccess(0, enabled);

    return enabled;
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
      // console.error(e);
      console.log('Could not get Big Inning data');
    }
  };

  private checkMlbNetworkAccess = async (): Promise<boolean> => {
    if (!this.entitlements) {
      await this.getSession();
    }

    const useLinear = await usesLinear();

    let enabled = false;

    if (this.entitlements?.some(n => n.code === 'MLBN') && useLinear) {
      enabled = true;
    }

    await this.updateChannelAccess(1, enabled);

    return enabled;
  };

  private getMlbNetworkSchedule = async (): Promise<IMLBNetworkEvent[]> => {
    try {
      const url = 'https://mlbn.mlbstatic.com/schedule.json';

      const {data} = await axios.get<{shows: IMLBNetworkEvent[]}>(url, {
        headers: {
          'User-Agent': userAgent,
          'x-requested-with': 'com.bamnetworks.mobile.android.gameday.atbat',
        },
      });

      return data.shows;
    } catch (e) {
      console.error(e);
      console.log('Could not get MLB Network schedule');
    }
  };

  private getMlbNetworkStream = async (): Promise<string> => {
    try {
      const url = ['https://', 'falcon.mlbinfra.com', '/api/v1/', 'mvpds/mlbn/feeds'].join('');

      const {data} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          'User-Agent': userAgent,
        },
      });

      return data.url;
    } catch (e) {
      console.error(e);
      console.log('Could not get MLB Network stream info');
    }
  };

  private checkSnyAccess = async (): Promise<boolean> => {
    if (!this.entitlements) {
      await this.getSession();
    }

    const useLinear = await usesLinear();

    let enabled = false;

    if (this.entitlements?.some(n => n.code === 'SNY_121') && useLinear) {
      enabled = true;
    }

    await this.updateChannelAccess(2, enabled);

    return enabled;
  };

  private getSnySchedule = async (): Promise<TSNYEvent[]> => {
    let events: TSNYEvent[] = [];

    try {
      const url = ['https://', 'production-api.sny.tv', '/production/', 'api/cms', '/schedule'].join('');

      const {data} = await axios.get<{schedule: ISNYSchedule}>(url, {
        headers: {
          'user-agent': userAgent,
        },
      });

      const [now] = normalTimeRange();

      for (const addDay of [0, 1, 2]) {
        const momentDate = moment(now).add(addDay, 'day');
        const formattedDate = momentDate.format('MM/DD/YYYY');

        const scheduleDay = data.schedule[formattedDate];

        if (scheduleDay) {
          events = [...events, ...scheduleDay.data.rows];
        }
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get SNY schedule');
    }

    return events;
  };

  private getStream = async (network: string): Promise<TChannelPlaybackInfo> => {
    try {
      const params = {
        operationName: 'contentCollections',
        query:
          'query contentCollections(\n        $categories: [ContentGroupCategory!]\n        $includeRestricted: Boolean = false\n        $includeSpoilers: Boolean = false\n        $limit: Int = 10,\n        $skip: Int = 0\n    ) {\n        contentCollections(\n            categories: $categories\n            includeRestricted: $includeRestricted\n            includeSpoilers: $includeSpoilers\n            limit: $limit\n            skip: $skip\n        ) {\n            title\n            category\n            contents {\n                assetTrackingKey\n                contentDate\n                contentId\n                contentRestrictions\n                description\n                duration\n                language\n                mediaId\n                officialDate\n                title\n                mediaState {\n                    state\n                    mediaType\n                }\n                thumbnails {\n                    thumbnailType\n                    templateUrl\n                    thumbnailUrl\n                }\n            }\n        }\n    }',
        variables: {
          categories: [network],
          limit: 25,
        },
      };
      const {data} = await axios.post(GRAPHQL_URL, params, {
        headers: {
          ...COMMON_HEADERS,
          ...this.getGraphQlHeaders(),
        },
      });

      const availableStreams = data?.data?.contentCollections?.[0]?.contents;

      let [url, headers]: Partial<TChannelPlaybackInfo> = [, {}];
      let hasValidStream = false;

      for (const stream of availableStreams) {
        if (hasValidStream) {
          continue;
        }

        try {
          [url, headers] = await this.getEventData(stream.mediaId);

          await axios.get(url, {
            headers: {
              ...headers,
            },
          });

          hasValidStream = true;
        } catch (e) {}
      }

      if (hasValidStream && url) {
        return [url, headers];
      }

      throw new Error(`Could not find stream for ${network}!`);
    } catch (e) {
      console.log(`Could not find stream for ${network}!`);
    }
  };

  private checkSnlaAccess = async (): Promise<boolean> => {
    if (!this.entitlements) {
      await this.getSession();
    }

    const useLinear = await usesLinear();

    let enabled = false;

    if (this.entitlements?.some(n => n.code === 'SNLA_119') && useLinear) {
      enabled = true;
    }

    await this.updateChannelAccess(3, enabled);

    return enabled;
  };

  private getSnlaSchedule = async (): Promise<ISNLAEventCombined[]> => {
    const snlaEvents: ISNLAEventCombined[] = [];

    try {
      const url = [
        'https://',
        'spectrumsportsnet.com',
        '/services/sports',
        '/v1/schedule-data',
        '.networkId_87024',
      ].join('');

      const {data} = await axios.get<{87024: ISNLAScheduleRes}>(url, {
        headers: {
          'user-agent': userAgent,
        },
      });

      const {programs, events} = data[87024];

      events.forEach(e => {
        if (programs[e.programId]) {
          snlaEvents.push({
            ...e,
            ...programs[e.programId],
          });
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not get SNLA schedule');
    }

    return snlaEvents;
  };

  private getEvents = async (): Promise<any[]> => {
    let entries = [];

    try {
      const [startDate, endDate] = normalTimeRange();

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
      const [startDate, endDate] = normalTimeRange();

      const url = [
        'https://mastapi.mobile.mlbinfra.com/api/epg/v3/search?exp=MLB',
        `&startDate=${startDate.format('YYYY-MM-DD')}`,
        `&endDate=${endDate.format('YYYY-MM-DD')}`,
      ].join('');

      let oktaToken: string | undefined;

      try {
        oktaToken = await this.getOktaToken();
      } catch (e) {}

      const {data} = await axios.get<{results: IGameFeed[]}>(url, {
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          ...(this.access_token &&
            oktaToken && {
              authorization: 'Bearer ' + this.access_token,
              'x-okta-id': oktaToken,
            }),
        },
      });

      return data.results;
    } catch (e) {
      throw new Error(e);
    }
  };

  private getOktaToken = async (): Promise<string | undefined> => {
    if (!this.playback_token || !this.playback_token_exp || moment().isAfter(this.playback_token_exp)) {
      await this.getEventData('b7f0fff7-266f-4171-aa2d-af7988dc9302');
    }

    const encoded_okta_id = this.playback_token.split('_')[1];

    if (encoded_okta_id && encoded_okta_id.length > 0) {
      const base64Okta = `${encoded_okta_id}==`;

      if (isBase64(base64Okta)) {
        return Buffer.from(base64Okta, 'base64').toString('ascii');
      }
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

      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not get refresh token for MLB.tv');
    }
  };

  public authenticateRegCode = async (): Promise<boolean> => {
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

      await this.save();

      await this.recheckMlbNetworkAccess();
      await this.checkSnyAccess();
      await this.checkSnlaAccess();
      await this.getOktaToken();

      return true;
    } catch (e) {
      return false;
    }
  };

  public getAuthCode = async (): Promise<string> => {
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

      return data.user_code;
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for MLB.tv');
    }
  };

  private getSession = async (): Promise<void> => {
    try {
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

      const {data} = await axios.post(GRAPHQL_URL, params, {
        headers: {
          ...COMMON_HEADERS,
          ...this.getGraphQlHeaders(),
        },
      });

      this.session_id = data.data.initSession.sessionId;
      this.entitlements = data.data.initSession.entitlements;
    } catch (e) {
      console.error(e);
      console.log('Could not get session id');
    }
  };

  private getGraphQlHeaders = () => ({
    accept: 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.5',
    authorization: 'Bearer ' + this.access_token,
    connection: 'keep-alive',
    'content-type': 'application/json',
    'x-client-name': 'WEB',
    'x-client-version': '7.8.1',
  });

  private save = async () => {
    await db.providers.updateAsync(
      {name: 'mlbtv'},
      {$set: {tokens: _.omit(this, 'entitlements', 'session_id', 'playback_token', 'playback_token_exp')}},
    );
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});
    const {device_id, access_token, expires_at, refresh_token} = tokens;

    this.device_id = device_id;
    this.access_token = access_token;
    this.expires_at = expires_at;
    this.refresh_token = refresh_token;
  };

  private loadJSON = () => {
    if (fs.existsSync(mlbConfigPath)) {
      const {device_id, access_token, expires_at, refresh_token} = fsExtra.readJSONSync(mlbConfigPath);

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
    }
  };
}

export type TMLBTokens = ClassTypeWithoutMethods<MLBHandler>;

export const mlbHandler = new MLBHandler();
