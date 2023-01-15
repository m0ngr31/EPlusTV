import moment from 'moment';

import {db} from './database';
import {foxHandler, IFoxEvent} from './fox-handler';
import {useFoxSports} from './networks';
import {IEntry} from './shared-interfaces';

const parseCategories = (event: IFoxEvent) => {
  const categories = ['Sports', 'FOX Sports'];
  for (const classifier of [...(event.categoryTags || []), ...(event.genres || [])]) {
    if (classifier !== null) {
      categories.push(classifier);
    }
  }

  if (event.streamTypes.find(resolution => resolution === 'HDR' || resolution === 'SDR')) {
    categories.push('4K');
  }

  return [...new Set(categories)];
};

const parseAirings = async (events: IFoxEvent[]) => {
  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.id});

    if (!entryExists) {
      console.log('Adding event: ', event.name);

      await db.entries.insert<IEntry>({
        categories: parseCategories(event),
        duration: moment(event.endDate).diff(moment(event.startDate), 'seconds'),
        end: new Date(event.endDate).valueOf(),
        from: 'foxsports',
        id: event.id,
        image: event.images.logo?.FHD || event.images.seriesDetail?.FHD,
        name: event.name,
        network: event.callSign,
        start: new Date(event.startDate).valueOf(),
      });
    }
  }
};

export const getFoxEventSchedules = async (): Promise<void> => {
  if (!useFoxSports) {
    return;
  }

  console.log('Looking for FOX Sports events...');

  const entries: IFoxEvent[] = await foxHandler.getEvents();

  try {
    await parseAirings(entries);
  } catch (e) {
    console.error(e);
    console.log('Could not parse FOX Sports events');
  }
};
