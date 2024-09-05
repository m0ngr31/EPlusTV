import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {b1gUserAgent, okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useB1GPlus} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';

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

  const awayTeam = `${event.awayCompetitor.name} ${event.awayCompetitor.fullName}`;
  const homeTeam = `${event.homeCompetitor.name} ${event.homeCompetitor.fullName}`;

  categories.push(awayTeam);
  categories.push(homeTeam);

  return {
    categories: [...new Set(categories)],
    image: `https://www.bigtenplus.com/image/original/${event.images[0].path}`,
    name: `${awayTeam} vs ${homeTeam}`,
    sport,
  };
};

const parseAirings = async (events: IB1GEvent[]) => {
  const now = moment();

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const gameData = getEventData(event);

    for (const content of event.content) {
      const entryExists = await db.entries.findOne<IEntry>({id: `b1g-${content.id}`});

      if (!entryExists) {
        const start = moment(event.startTime);
        const end = moment(event.startTime).add(5, 'hours');

        if (end.isBefore(now) || content.enableDrmProtection) {
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
    if (!useB1GPlus) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.expires_at || !this.access_token || moment(this.expires_at).isBefore(moment().add(100, 'days'))) {
      await this.login();
    }
  };

  public refreshTokens = async () => {
    if (!useB1GPlus) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(100, 'days'))) {
      await this.login();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useB1GPlus) {
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
          `&date_time_to=${encodeURIComponent(moment().add(3, 'days').format())}`,
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
      const url = 'https://www.bigtenplus.com/api/v3/cleeng/extend_token';
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

      this.save();
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

  private login = async (): Promise<void> => {
    try {
      const url = 'https://www.bigtenplus.com/api/v3/cleeng/login';
      const headers = {
        'User-Agent': b1gUserAgent,
        accept: 'application/json',
        'content-type': 'application/json',
      };

      const params = {
        email: process.env.B1GPLUS_USER,
        password: process.env.B1GPLUS_PASS,
      };

      const {data} = await axios.post(url, params, {
        headers,
      });

      this.access_token = data.token;
      this.expires_at = moment().add(399, 'days').valueOf();

      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not login to B1G+');
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'b1g_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'b1g_tokens.json'))) {
      const {access_token, expires_at} = fsExtra.readJSONSync(path.join(configPath, 'b1g_tokens.json'));

      this.access_token = access_token;
      this.expires_at = expires_at;
    }
  };
}

export const b1gHandler = new B1GHandler();
