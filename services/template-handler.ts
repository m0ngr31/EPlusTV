import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID, normalTimeRange} from './shared-helpers';
import {debug} from './debug';

interface ITemplateEvent {
  id: number;
  start: string;
  end: string;
  name: string;
  sport: string;
  image: string;
  categories: string[];
}

const parseAirings = async (events: ITemplateEvent[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `${event.id}`});

    if (!entryExists) {
      const start = moment(event.start);
      const end = moment(event.end).add(1, 'hour');
      const originalEnd = moment(event.end);

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', event.name);

      await db.entries.insertAsync<IEntry>({
        categories: event.categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'template',
        id: `${event.id}`,
        image: event.image,
        name: event.name,
        network: 'Template Sports',
        originalEnd: originalEnd.valueOf(),
        sport: event.sport,
        start: start.valueOf(),
      });
    }
  }
};

class TemplateHandler {
  public device_id?: string;
  public user_id?: string;
  public mvpd_id?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'template'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const data: TTemplateTokens = {};

      await db.providers.insertAsync<IProvider<TTemplateTokens>>({
        enabled: false,
        name: 'template',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'template'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'template'});

    if (!enabled) {
      return;
    }

    // Refresh logic
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'template'});

    if (!enabled) {
      return;
    }

    console.log('Looking for Template events...');

    const entries: ITemplateEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    try {
      const url = [].join('');

      const {data} = await axios.get<ITemplateEvent[]>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
      });

      debug.saveRequestData(data, 'template', 'epg');

      data.forEach(e => {
        if (moment(e.start).isBefore(endSchedule) && moment(e.end).isAfter(now)) {
          entries.push(e);
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not parse Template Sports events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const event = await db.entries.findOneAsync<IEntry>({id: eventId});

    try {
      let streamUrl: string;

      if (event.url) {
        streamUrl = event.url;
      }

      return [streamUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public getAuthCode = async (): Promise<string> => {
    this.device_id = getRandomUUID();

    try {
      const url = [].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
      });

      return data.code;
    } catch (e) {
      console.error(e);
      console.log('Could not login to Template Sports');
    }
  };

  public authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = [code].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
      });

      if (!data || data?.subscriptions.adobe !== 'y') {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'template'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TTemplateTokens>>({name: 'template'});
    const {device_id, user_id, mvpd_id} = tokens || {};

    this.device_id = device_id;
    this.user_id = user_id;
    this.mvpd_id = mvpd_id;
  };
}

export type TTemplateTokens = ClassTypeWithoutMethods<TemplateHandler>;

export const templateHandler = new TemplateHandler();
