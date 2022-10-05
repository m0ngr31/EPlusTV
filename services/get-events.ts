import moment from 'moment';

import { db } from './database';
import { espnHandler } from './espn-handler';

const parseCategories = event => {
  const categories = ['Sports'];
  for (const classifier of [event.category, event.subcategory, event.sport, event.league]){
    if (classifier !== null && classifier.name !== null){
      categories.push(classifier.name);
    }
  }
  return [...new Set(categories)];
}

const parseAirings = async events => {
  for (const event of events) {
    const entryExists = await db.entries.findOne({id: event.id});

    if (!entryExists) {
      console.log('Adding event: ', event.name);

      await db.entries.insert({
        id: event.id,
        name: event.name,
        start: new Date(event.startDateTime).valueOf(),
        duration: event.duration,
        end: moment(event.startDateTime).add(event.duration, 'seconds').valueOf(),
        feed: event.feedName,
        image: event.image?.url,
        categories: parseCategories(event)
      });
    }
  }
};

export const getEventSchedules = async () => {
  try {
    console.log('Looking for live events...');
    const entries = await espnHandler.getLiveEvents();
    parseAirings(entries);
  } catch (e) {
    console.log("Couldn't get live events");
  }

  const today = new Date();

  console.log('Looking for upcoming events...');
  for (const [i] of [0, 1, 2, 3].entries()) {
    const date = moment(today).add(i, 'days');

    try {
      const entries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'));
      parseAirings(entries);
    } catch (e) {
      console.log(`Couldn't get events for ${date.format('dddd, MMMM Do YYYY')}`)
    }
  }

  console.log('Cleaning up old events');
  const now = new Date().valueOf();
  await db.entries.remove({end: {$lt: now}}, {multi: true});
};
