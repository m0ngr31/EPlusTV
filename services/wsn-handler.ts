import moment from 'moment';

import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {normalTimeRange} from './shared-helpers';
import {ITubiEvent, tubiHelper} from './tubi-helper';

const parseAirings = async (events: ITubiEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
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
        categories: [...new Set(['WSN', "Women's Sports Network", "Women's Sports"])],
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
      const {programs} = await tubiHelper(692073);

      debug.saveRequestData(programs, 'wsn', 'epg');

      await parseAirings(programs);
    } catch (e) {
      console.error(e);
      console.log("Could not parse Women's Sports Network events");
    }
  };

  public getEventData = async (): Promise<TChannelPlaybackInfo> => {
    try {
      const {video_resources} = await tubiHelper(692073);
      const eventData = video_resources.find(a => a.type === 'hlsv3');

      if (eventData) {
        return [eventData.manifest.url, {}];
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get event data');
    }
  };
}

export const wsnHandler = new WomensSportsNetworkHandler();
