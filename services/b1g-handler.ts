import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {b1gUserAgent, okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useB1GPlus} from './networks';
import {ClassTypeWithoutMethods, IEntry, IHeaders, IProvider} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';

interface IEventCategory {
  name: string;
}

interface IEventTeam {
  name: string;
  shortName: string;
  fullName: string;
}

interface IEventMetadata {
  name: string;
  type: {
    name: string;
  };
}

interface IEventImage {
  path: string;
}

interface IEventContent {
  id: number;
  enableDrmProtection: boolean;
}

interface IB1GEvent {
  id: number;
  title?: string;
  startTime: string;
  category1: IEventCategory;
  category2: IEventCategory;
  category3: IEventCategory;
  homeCompetitor: IEventTeam;
  awayCompetitor: IEventTeam;
  clientMetadata: IEventMetadata[];
  images: IEventImage[];
  content: IEventContent[];
}

interface IGameData {
  name: string;
  sport: string;
  image: string;
  categories: string[];
}

interface IB1GMeta {
  username: string;
  password: string;
}

const b1gConfigPath = path.join(configPath, 'b1g_tokens.json');

const getEventData = (event: IB1GEvent): IGameData => {
  let sport = 'B1G+ Event';
  const categories: string[] = ['B1G+', 'B1G'];

  event.clientMetadata.forEach(e => {
    if (e.type.name === 'Sport') {
      sport = e.name;
      categories.push(e.name);
    }

    if (e.type.name === 'sports') {
      categories.push(e.name);
    }
  });

  let awayTeam: string;
  let homeTeam: string;

  try {
    awayTeam = `${event.awayCompetitor.name} ${event.awayCompetitor.fullName}`;
    categories.push(awayTeam);
  } catch (e) {}

  try {
    homeTeam = `${event.homeCompetitor.name} ${event.homeCompetitor.fullName}`;
    categories.push(homeTeam);
  } catch (e) {}

  const eventName = event.title ? event.title : `${awayTeam} at ${homeTeam}`;

  return {
    categories: [...new Set(categories)],
    image: `https://www.bigtenplus.com/image/original/${event.images[0].path}`,
    name: eventName,
    sport,
  };
};

const parseAirings = async (events: IB1GEvent[]) => {
  const now = moment();
  const endDate = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const gameData = getEventData(event);

    for (const content of event.content) {
      const entryExists = await db.entries.findOne<IEntry>({id: `b1g-${content.id}`});

      if (!entryExists) {
        const start = moment(event.startTime);
        const end = moment(event.startTime).add(4, 'hours');

        if (end.isBefore(now) || start.isAfter(endDate) || content.enableDrmProtection) {
          continue;
        }

        console.log('Adding event: ', gameData.name);

        await db.entries.insert<IEntry>({
          categories: gameData.categories,
          duration: end.diff(start, 'seconds'),
          end: end.valueOf(),
          from: 'b1g+',
          id: `b1g-${content.id}`,
          image: gameData.image,
          name: gameData.name,
          network: 'B1G+',
          sport: gameData.sport,
          start: start.valueOf(),
        });
      }
    }
  }
};

class B1GHandler {
  public access_token?: string;
  public expires_at?: number;

  public initialize = async () => {
    const setup = (await db.providers.count({name: 'b1g'})) > 0 ? true : false;

    if (!setup) {
      const data: TB1GTokens = {};

      if (useB1GPlus) {
        this.loadJSON();

        data.access_token = this.access_token;
        data.expires_at = this.expires_at;
      }

      await db.providers.insert<IProvider<TB1GTokens, IB1GMeta>>({
        enabled: useB1GPlus,
        meta: {
          password: process.env.B1GPLUS_PASS,
          username: process.env.B1GPLUS_USER,
        },
        name: 'b1g',
        tokens: data,
      });

      if (fs.existsSync(b1gConfigPath)) {
        fs.rmSync(b1gConfigPath);
      }
    }

    if (useB1GPlus) {
      console.log('Using B1GPLUS variable is no longer needed. Please use the UI going forward');
    }
    if (process.env.B1GPLUS_USER) {
      console.log('Using B1GPLUS_USER variable is no longer needed. Please use the UI going forward');
    }
    if (process.env.B1GPLUS_PASS) {
      console.log('Using B1GPLUS_PASS variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOne<IProvider>({name: 'b1g'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'b1g'});

    if (!enabled) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(100, 'days'))) {
      await this.login();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'b1g'});

    if (!enabled) {
      return;
    }

    console.log('Looking for B1G+ events...');

    try {
      let hasNextPage = true;
      let page = 1;
      let events: IB1GEvent[] = [];

      while (hasNextPage) {
        const url = [
          'https://',
          'www.bigtenplus.com',
          '/api/v2',
          '/events',
          '?sort_direction=asc',
          '&device_category_id=2',
          '&language=en',
          `&metadata_id=${encodeURIComponent('159283,167702')}`,
          `&date_time_from=${encodeURIComponent(moment().format())}`,
          `&date_time_to=${encodeURIComponent(moment().add(2, 'days').endOf('day').format())}`,
          page > 1 ? `&page=${page}` : '',
        ].join('');

        const {data} = await axios.get(url, {
          headers: {
            'user-agent': okHttpUserAgent,
          },
        });

        if (data.meta.last_page === page) {
          hasNextPage = false;
        }

        events = events.concat(data.data);
        page += 1;
      }

      debug.saveRequestData(events, 'b1g+', 'epg');

      await parseAirings(events);
    } catch (e) {
      console.error(e);
      console.log('Could not parse B1G+ events');
    }
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
    const id = eventId.replace('b1g-', '');

    try {
      await this.extendToken();

      const accessToken = await this.checkAccess(id);
      const {user_id}: {user_id: string} = jwt_decode(accessToken);
      const streamUrl = await this.getStream(id, user_id, accessToken);

      return [streamUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private extendToken = async (): Promise<void> => {
    try {
      const url = ['https://', 'www.bigtenplus.com', '/api/v3/cleeng/extend_token'].join('');
      const headers = {
        Authorization: `Bearer ${this.access_token}`,
        'User-Agent': b1gUserAgent,
        accept: 'application/json',
      };

      const {data} = await axios.post(
        url,
        {},
        {
          headers,
        },
      );

      this.access_token = data.token;
      this.expires_at = moment().add(399, 'days').valueOf();

      await this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not extend token for B1G+');
    }
  };

  private checkAccess = async (eventId: string): Promise<string> => {
    try {
      const url = `https://www.bigtenplus.com/api/v3/contents/${eventId}/check-access`;
      const headers = {
        Authorization: `Bearer ${this.access_token}`,
        'User-Agent': b1gUserAgent,
        accept: 'application/json',
        'content-type': 'application/json',
      };

      const params = {
        type: 'cleeng',
      };

      const {data} = await axios.post(url, params, {
        headers,
      });

      return data.data;
    } catch (e) {
      console.error(e);
      console.log('Could not get playback access token');
    }
  };

  private getStream = async (eventId: string, userId: string, accessToken: string): Promise<string> => {
    try {
      const url = [
        'https://',
        'www.bigtenplus.com',
        '/api/v3',
        '/contents',
        `/${eventId}`,
        '/access/hls',
        `?csid=${userId}`,
      ].join('');

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': okHttpUserAgent,
        'content-type': 'application/json',
      };

      const {data} = await axios.post(
        url,
        {},
        {
          headers,
        },
      );

      return data.data.stream;
    } catch (e) {
      console.error(e);
      console.log('Could not get playback access token');
    }
  };

  public login = async (username?: string, password?: string): Promise<boolean> => {
    try {
      const url = ['https://', 'www.bigtenplus.com', '/api/v3/cleeng/login'].join('');
      const headers = {
        'User-Agent': b1gUserAgent,
        accept: 'application/json',
        'content-type': 'application/json',
      };

      const {meta} = await db.providers.findOne<IProvider<any, IB1GMeta>>({name: 'b1g'});

      const params = {
        email: username || meta.username,
        password: password || meta.password,
      };

      const {data} = await axios.post(url, params, {
        headers,
      });

      this.access_token = data.token;
      this.expires_at = moment().add(399, 'days').valueOf();

      await this.save();

      return true;
    } catch (e) {
      console.error(e);
      console.log('Could not login to B1G+');

      return false;
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.update({name: 'b1g'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOne<IProvider<TB1GTokens>>({name: 'b1g'});
    const {access_token, expires_at} = tokens;

    this.access_token = access_token;
    this.expires_at = expires_at;
  };

  private loadJSON = () => {
    if (fs.existsSync(b1gConfigPath)) {
      const {access_token, expires_at} = fsExtra.readJSONSync(path.join(configPath, 'b1g_tokens.json'));

      this.access_token = access_token;
      this.expires_at = expires_at;
    }
  };
}

export type TB1GTokens = ClassTypeWithoutMethods<B1GHandler>;

export const b1gHandler = new B1GHandler();
