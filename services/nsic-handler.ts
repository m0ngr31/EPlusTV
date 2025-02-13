import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {normalTimeRange} from './shared-helpers';

interface INSICEvent {
  id: string;
  site_title: string;
  section_title: string;
  title: string;
  description: string;
  date: string;
  expected_duration: number;
  large_image: string;
}

const parseAirings = async (events: INSICEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: `nsic-${event.id}`});

    if (!entryExists) {
      const start = moment(event.date);
      if (!event.expected_duration) {
        event.expected_duration = 3*60*60;
      }
      const end = moment(event.date).add(event.expected_duration, 'seconds').add(1, 'hours');
      const originalEnd = moment(event.date).add(event.expected_duration, 'seconds');

      if (end.isBefore(now) || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insertAsync<IEntry>({
        categories: [...new Set(['Northern Sun', 'NSIC', event.section_title])],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'northern-sun',
        id: `nsic-${event.id}`,
        image: event.large_image,
        name: event.title,
        network: 'NSIC',
        originalEnd: originalEnd.valueOf(),
        sport: event.section_title,
        start: start.valueOf(),
      });
    }
  }
};

class NorthernSunHandler {
  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'nsic'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      await db.providers.insertAsync<IProvider>({
        enabled: false,
        name: 'nsic',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nsic'});

    if (!enabled) {
      return;
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'nsic'});

    if (!enabled) {
      return;
    }

    console.log('Looking for NSIC events...');

    try {
      const sites = [
        '2132',
        '2133',
        '2134',
        '2135',
        '2136',
        '2138',
        '2139',
        '2140',
        '2141',
        '2143',
        '2144',
        '2145',
        '2146',
        '2147',
        '2148',
        '2149',
      ];

      const url = [
        'https://',
        'vcloud.hudl.com',
        '/api/viewer/',
        'broadcast',
        '?include_deletions=0',
        '&page=1&per_page=100',
        '&site_id=',
        encodeURIComponent(sites.join(',')),
        '&after=',
        encodeURIComponent(moment().format('ddd, DD MMM YYYY') + ' 06:00:00 GMT'),
        '&before=',
        encodeURIComponent(moment().add(4, 'days').format('ddd, DD MMM YYYY') + ' 06:00:00 GMT'),
        '&sort_by=date&sort_dir=asc'
      ].join('');

      const {data} = await axios.get(url, {
        headers: {
          'user-agent': userAgent,
        },
      });

      debug.saveRequestData(data, 'nsic', 'epg');

      await parseAirings(data.broadcasts);
    } catch (e) {
      console.error(e);
      console.log('Could not parse NSIC events');
    }
  };

  public getEventData = async (eventId: string): Promise<TChannelPlaybackInfo> => {
    const id = eventId.replace('nsic-', '');

    try {
      const streamUrl = await this.getStream(id);

      return [streamUrl, {'user-agent': userAgent}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private getStream = async (eventId: string): Promise<string> => {
    try {
      const url = [
        'https://',
        'vcloud.hudl.com',
        '/file/broadcast/',
        `/${eventId}`,
        '.m3u8',
        '?hfr=1',
      ].join('');

      return url;
    } catch (e) {
      console.error(e);
      console.log('Could not get stream');
    }
  };
}

export const nsicHandler = new NorthernSunHandler();
