import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {normalTimeRange} from './shared-helpers';

interface IWSNRes {
  video_resources: {
    type: string;
    manifest: {
      url: string;
    };
  }[];
  programs: IWSNEvent[];
}

interface IWSNEvent {
  images: {
    thumbnail: string[];
    poster: string[];
  };
  title: string;
  start_time: string;
  end_time: string;
  description: string;
  id: string;
}

const parseAirings = async (events: IWSNEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `wsn-${event.id}`});

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
        categories: [...new Set(['WSN', "Women's Sports Network", "Women's"])],
        channel: 'WSN',
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'wsn',
        id: `wsn-${event.id}`,
        image,
        linear: true,
        name: event.title,
        network: 'WSN',
        originalEnd: end.valueOf(),
        start: start.valueOf(),
      });
    }
  }
};

class WomensSportsNetworkHandler {
  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'wsn'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      await db.providers.insertAsync<IProvider>({
        enabled: false,
        name: 'wsn',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'wsn'});

    if (!enabled) {
      return;
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'wsn'});

    if (!enabled) {
      return;
    }

    console.log("Looking for Women's Sports Network events...");

    try {
      const {programs} = await this.getTubiData();

      debug.saveRequestData(programs, 'wsn', 'epg');

      await parseAirings(programs);
    } catch (e) {
      console.error(e);
      console.log("Could not parse Women's Sports Network events");
    }
  };

  public getEventData = async (): Promise<TChannelPlaybackInfo> => {
    try {
      const {video_resources} = await this.getTubiData();
      const eventData = video_resources.find(a => a.type === 'hlsv3');

      if (eventData) {
        return [eventData.manifest.url, {}];
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get event data');
    }
  };

  private getTubiData = async (): Promise<IWSNRes> => {
    try {
      const url = [
        'https://',
        'epg-cdn.production-public.tubi.io',
        '/content/epg/programming',
        '?content_id=692073',
        '&platform=web',
      ].join('');

      const {data} = await axios.get<{rows: IWSNRes[]}>(url, {
        headers: {
          'user-agent': userAgent,
        },
      });

      return data.rows[0];
    } catch (e) {
      console.error(e);
      console.log("Could not get Women's Sports Network data");
    }
  };
}

export const wsnHandler = new WomensSportsNetworkHandler();
