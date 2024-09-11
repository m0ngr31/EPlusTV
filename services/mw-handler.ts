import axios from 'axios';
import moment from 'moment';

import {userAgent} from './user-agent';
import {useMountainWest} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';

interface IMWEvent {
  image: string;
  thumbnail: string;
  title: string;
  start_time: string;
  end_time: string;
  value: string;
  description: string;
  sport_category_title: string;
  id: string;
  format: string;
}

const parseAirings = async (events: IMWEvent[]) => {
  const now = moment();
  const endSchedule = moment().add(2, 'days');

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const entryExists = await db.entries.findOne<IEntry>({id: `mw-${event.id}`});

    if (!entryExists) {
      const start = moment(event.start_time);
      const end = moment(event.end_time).add(1, 'hours');

      if (end.isBefore(now) || event.format !== 'video' || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insert<IEntry>({
        categories: [...new Set(['Mountain West', 'The MW', event.sport_category_title])],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'mountain-west',
        id: `mw-${event.id}`,
        image: event.image || event.thumbnail,
        name: event.title,
        network: 'MW',
        sport: event.sport_category_title,
        start: start.valueOf(),
        url: event.value,
      });
    }
  }
};

class MountainWestHandler {
  public getSchedule = async (): Promise<void> => {
    if (!useMountainWest) {
      return;
    }

    console.log('Looking for Mountain West events...');

    try {
      const url = ['https://themw.com/wp-json/v1/videos?video_categories[]=102&page=1&order_by=start_date'].join('');

      const {data} = await axios.get<{data: IMWEvent[]}>(url, {
        headers: {
          'user-agent': userAgent,
        },
      });

      await parseAirings(data.data);
    } catch (e) {
      console.error(e);
      console.log('Could not parse Mountain West events');
    }
  };

  public getEventData = async (id: string): Promise<[string, IHeaders]> => {
    try {
      const event = await db.entries.findOne<IEntry>({id});

      if (event) {
        return [event.url, {}];
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get event data');
    }
  };
}

export const mwHandler = new MountainWestHandler();