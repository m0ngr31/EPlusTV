import moment from 'moment';

import {nbcHandler, INbcEntry, parseUrl} from './nbc-handler';
import {useNbcSports} from './networks';
import {db} from './database';
import {IEntry} from './shared-interfaces';

const parseCategories = (event: INbcEntry) => {
  const categories = ['Sports', 'NBC Sports', event.sportName];

  return [...new Set(categories)];
};

const parseStart = (start: string): number => parseInt(moment.utc(start, 'YYYYMMDD-HHmm').format('x'), 10);
const parseEnd = (end: string): number => parseInt(moment.utc(end, 'YYYY-MM-DD HH:mm:ss').format('x'), 10);
const parseDuration = (event: INbcEntry): number =>
  moment(parseEnd(event.eventtimeofdayend)).diff(moment(parseStart(event.start)), 'seconds');

const parseAirings = async (events: INbcEntry[]) => {
  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.pid});

    if (!entryExists) {
      const start = parseStart(event.start);
      const end = parseEnd(event.eventtimeofdayend);

      const now = moment();
      const twoDays = moment().add(2, 'days');

      if (moment(start).isAfter(twoDays) || moment(end).isBefore(now)) {
        continue;
      }

      // Don't mess with DRM stuff for right now
      // if (
      //   event.videoSources &&
      //   event.videoSources[0] &&
      //   (event.videoSources[0].drmType || event.videoSources[0].drmAssetId)
      // ) {
      //   console.log(`${event.title} has DRM, so not scheduling`);
      //   continue;
      // }

      console.log('Adding event: ', event.title);

      await db.entries.insert<IEntry>({
        categories: parseCategories(event),
        duration: parseDuration(event),
        end,
        from: 'nbcsports',
        id: event.pid,
        image: `http://hdliveextra-pmd.edgesuite.net/HD/image_sports/mobile/${event.image}_m50.jpg`,
        name: event.title,
        network: event.channel,
        start,
        url: parseUrl(event),
      });
    } else if (!entryExists.url || entryExists.url.length === 0) {
      // Don't mess with DRM stuff for right now
      // if (
      //   event.videoSources &&
      //   event.videoSources[0] &&
      //   (event.videoSources[0].drmType || event.videoSources[0].drmAssetId)
      // ) {
      //   continue;
      // }

      const eventUrl = parseUrl(event);

      if (eventUrl) {
        console.log('Updating event: ', event.title);
        await db.entries.update<IEntry>({_id: entryExists._id}, {$set: {url: parseUrl(event)}});
      }
    }
  }
};

export const getNbcEventSchedules = async (): Promise<void> => {
  if (!useNbcSports) {
    return;
  }

  console.log('Looking for NBC Sports events...');

  const entries: INbcEntry[] = await nbcHandler.getEvents();

  try {
    await parseAirings(entries);
  } catch (e) {
    console.error(e);
    console.log('Could not parse NBC Sports events');
  }
};
