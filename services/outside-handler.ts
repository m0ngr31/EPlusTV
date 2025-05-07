import axios from 'axios';
import moment from 'moment';

import {okHttpUserAgent} from './user-agent';
import {ClassTypeWithoutMethods, IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {normalTimeRange} from './shared-helpers';
import {usesLinear} from './misc-db-service';
import {ITubiEvent, tubiHelper} from './tubi-helper';
import {debug} from './debug';

const APP_KEY = [
  '2',
  '9',
  'b',
  '0',
  '4',
  'f',
  '7',
  '4',
  '3',
  'f',
  '2',
  '1',
  '5',
  '9',
  'b',
  'a',
  'b',
  'a',
  '9',
  '4',
  '8',
  '0',
  '0',
  'b',
  '8',
  'b',
  '2',
  '0',
  '5',
  'f',
  '9',
  '4',
].join('');

const APP_ID = '247';
const APP_PLATFORM = 'android_tv';
const APP_LANGUAGE = 'en';

const BASE_API_URL = 'https://api.maz.tv';

interface IOutsideEvent {
  cid: string;
  title: string;
  summary: string;
  access: {
    startsAt: string;
    endsAt: string;
  };
  previewImage: {
    url: string;
  };
  cover: {
    url: string;
  };
}

interface IOutsideSchedule {
  sections: {
    title: string;
    slug_identifier: string;
    contentArray: {
      title: string;
      slug_identifier: string;
      contentArray: IOutsideEvent[];
    }[];
  }[];
}

const parseAirings = async (events: IOutsideEvent[]) => {
  const [now, endDate] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.cid) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `outside-${event.cid}`});

    if (!entryExists) {
      const start = moment(new Date(event.access.startsAt));
      const end = moment(new Date(event.access.endsAt)).add(1, 'hour');
      const originalEnd = moment(new Date(event.access.endsAt));

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insertAsync<IEntry>({
        categories: ['Outside TV'],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'outside',
        id: `outside-${event.cid}`,
        image: event.previewImage.url || event.cover.url,
        name: event.title,
        network: 'Outside TV',
        originalEnd: originalEnd.valueOf(),
        start: start.valueOf(),
      });
    }
  }
};

const parseLinearAirings = async (events: ITubiEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `outside-${event.id}`});

    if (!entryExists) {
      const start = moment(event.start_time);
      const end = moment(event.end_time);

      if (end.isBefore(now) || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      let image = event.images.thumbnail.find(a => a);

      if (!image) {
        image = event.images.poster.find(a => a);
      }

      await db.entries.insertAsync<IEntry>({
        categories: ['Outside TV'],
        channel: 'OTVSTR',
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'outside',
        id: `outside-${event.id}`,
        image,
        linear: true,
        name: event.title,
        network: 'Outside',
        originalEnd: end.valueOf(),
        start: start.valueOf(),
      });
    }
  }
};

class OutsideHandler {
  public token?: string;
  public locale_id?: number;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'outside'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      const data: TOutsideTokens = {};
      const useLinear = await usesLinear();

      await db.providers.insertAsync<IProvider<TOutsideTokens>>({
        enabled: false,
        linear_channels: [
          {
            enabled: useLinear,
            id: 'OTVSTR',
            name: 'Outside',
            tmsId: '114313',
          },
        ],
        name: 'outside',
        tokens: data,
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'outside'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled, linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'outside'});

    if (!enabled) {
      return;
    }

    console.log('Looking for Outside TV events...');

    const entries: IOutsideEvent[] = [];

    const [now, endSchedule] = normalTimeRange();

    const signature = await this.getSignature();

    try {
      const url = ['https://', 'cloud.maz.tv', '/247/445/en/feeds/v1/tv_app_feed', signature].join('');

      const {data} = await axios.get<IOutsideSchedule>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': okHttpUserAgent,
        },
      });

      const events =
        data?.sections
          .find(a => a.slug_identifier === 'home')
          ?.contentArray.find(a => a.slug_identifier === 'live-events')?.contentArray || [];

      debug.saveRequestData(events, 'outside', 'epg');

      events.forEach(e => {
        if (
          moment(new Date(e.access.startsAt)).isBefore(endSchedule) &&
          moment(new Date(e.access.startsAt)).isAfter(now)
        ) {
          entries.push(e);
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not parse Outside TV events');
    }

    if (linear_channels?.[0]?.enabled) {
      await this.getLinearSchedule();
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const event = await db.entries.findOneAsync<IEntry>({id: eventId});

    try {
      let cid = '1187629';

      if (!event.linear) {
        cid = eventId.split('-')[1];
      }

      const url = [BASE_API_URL, '/v1', '/streams'].join('');

      const {data} = await axios.post(
        url,
        {
          cid,
          first_play: true,
          language: APP_LANGUAGE,
          locale_id: this.locale_id,
          platform: APP_PLATFORM,
          progress: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${this.token}`,
            'user-agent': okHttpUserAgent,
          },
        },
      );

      return [data.url, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  public getAuthCode = async (): Promise<[string, string, string]> => {
    await this.getSignature();

    try {
      const url = [BASE_API_URL, '/device_codes'].join('');

      const {data} = await axios.post(
        url,
        {
          app_user: {
            app_id: APP_ID,
          },
          key: APP_KEY,
          language: APP_LANGUAGE,
          locale_id: this.locale_id,
          platform: APP_PLATFORM,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      return [data.code, encodeURIComponent(data.sign_in_url), encodeURIComponent(data.polling_url)];
    } catch (e) {
      console.error(e);
      console.log('Could not login to Outside TV');
    }
  };

  public authenticateRegCode = async (checkUrl: string): Promise<boolean> => {
    const url = [decodeURIComponent(checkUrl), '?key=', APP_KEY].join('');

    console.log('Authenticating Outside TV...', url);
    try {
      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': okHttpUserAgent,
        },
      });

      if (!data || !data?.polling_success) {
        return false;
      }

      this.token = data.token;

      await this.save();

      return true;
    } catch (e) {
      return false;
    }
  };

  private getLinearSchedule = async (): Promise<void> => {
    try {
      const {programs} = await tubiHelper(400000005);

      debug.saveRequestData(programs, 'outside', 'linear-epg');

      await parseLinearAirings(programs);
    } catch (e) {
      console.error(e);
      console.log('Could not parse Outside TV linear events');
    }
  };

  private getSignature = async (): Promise<string> => {
    try {
      const url = [BASE_API_URL, '/policy'].join('');

      const {data} = await axios.post(
        url,
        {
          app_id: APP_ID,
          key: APP_KEY,
          language: APP_LANGUAGE,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.locale_id = data.locale_id;

      await this.save();

      return data.signature;
    } catch (e) {
      console.error(e);
      console.log('Could not get Outside TV signature');
    }
  };

  private save = async (): Promise<void> => {
    await db.providers.updateAsync({name: 'outside'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOneAsync<IProvider<TOutsideTokens>>({name: 'outside'});
    const {locale_id, token} = tokens || {};

    this.locale_id = locale_id;
    this.token = token;
  };
}

export type TOutsideTokens = ClassTypeWithoutMethods<OutsideHandler>;

export const outsideHandler = new OutsideHandler();
