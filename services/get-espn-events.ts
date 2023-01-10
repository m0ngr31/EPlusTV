import moment from 'moment';

import {db} from './database';
import {espnHandler} from './espn-handler';
import {
  useEspn1,
  useEspn2,
  useEspn3,
  useEspnU,
  useEspnPlus,
  useSec,
  useSecPlus,
  useAccN,
  useAccNx,
  useLonghorn,
} from './networks';

const parseCategories = event => {
  const categories = ['Sports'];
  for (const classifier of [event.category, event.subcategory, event.sport, event.league]) {
    if (classifier !== null && classifier.name !== null) {
      categories.push(classifier.name);
    }
  }
  return [...new Set(categories)];
};

const parseAirings = async events => {
  for (const event of events) {
    const entryExists: any = await db.entries.findOne({id: event.id});

    if (!entryExists) {
      console.log('Adding event: ', event.name);

      await db.entries.insert({
        categories: parseCategories(event),
        duration: event.duration,
        end: moment(event.startDateTime).add(event.duration, 'seconds').valueOf(),
        feed: event.feedName,
        from: 'espn',
        id: event.id,
        image: event.image?.url,
        name: event.name,
        network: event.network?.name || 'ESPN+',
        start: new Date(event.startDateTime).valueOf(),
        url: event.source?.url,
      });
    }
  }
};

export const getEventSchedules = async (): Promise<void> => {
  let entries = [];

  try {
    console.log('Looking for live events...');

    if (useEspnPlus) {
      const liveEntries = await espnHandler.getLiveEvents();
      entries = [...entries, ...liveEntries];
    }
    if (useEspn1) {
      const liveEntries = await espnHandler.getLiveEvents('espn1');
      entries = [...entries, ...liveEntries];
    }
    if (useEspn2) {
      const liveEntries = await espnHandler.getLiveEvents('espn2');
      entries = [...entries, ...liveEntries];
    }
    if (useEspn3) {
      const liveEntries = await espnHandler.getLiveEvents('espn3');
      entries = [...entries, ...liveEntries];
    }
    if (useEspnU) {
      const liveEntries = await espnHandler.getLiveEvents('espnU');
      entries = [...entries, ...liveEntries];
    }
    if (useSec) {
      const liveEntries = await espnHandler.getLiveEvents('secn');
      entries = [...entries, ...liveEntries];
    }
    if (useSecPlus) {
      const liveEntries = await espnHandler.getLiveEvents('secnPlus');
      entries = [...entries, ...liveEntries];
    }
    if (useAccN) {
      const liveEntries = await espnHandler.getLiveEvents('accn');
      entries = [...entries, ...liveEntries];
    }
    if (useAccNx) {
      const liveEntries = await espnHandler.getLiveEvents('accnx');
      entries = [...entries, ...liveEntries];
    }
    if (useLonghorn) {
      const liveEntries = await espnHandler.getLiveEvents('longhorn');
      entries = [...entries, ...liveEntries];
    }
  } catch (e) {
    console.log("Couldn't get live events");
  }

  const today = new Date();

  console.log('Looking for upcoming events...');
  for (const [i] of [0, 1, 2].entries()) {
    const date = moment(today).add(i, 'days');

    try {
      if (useEspnPlus) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'));
        entries = [...entries, ...upcomingEntries];
      }
      if (useEspn1) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn1');
        entries = [...entries, ...upcomingEntries];
      }
      if (useEspn2) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn2');
        entries = [...entries, ...upcomingEntries];
      }
      if (useEspn3) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espn3');
        entries = [...entries, ...upcomingEntries];
      }
      if (useEspnU) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'espnU');
        entries = [...entries, ...upcomingEntries];
      }
      if (useSec) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'secn');
        entries = [...entries, ...upcomingEntries];
      }
      if (useSecPlus) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'secnPlus');
        entries = [...entries, ...upcomingEntries];
      }
      if (useAccN) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'accn');
        entries = [...entries, ...upcomingEntries];
      }
      if (useAccNx) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'accnx');
        entries = [...entries, ...upcomingEntries];
      }
      if (useLonghorn) {
        const upcomingEntries = await espnHandler.getUpcomingEvents(date.format('YYYY-MM-DD'), 'longhorn');
        entries = [...entries, ...upcomingEntries];
      }
    } catch (e) {
      console.log(`Couldn't get events for ${date.format('dddd, MMMM Do YYYY')}`);
    }
  }

  try {
    await parseAirings(entries);
  } catch (e) {
    console.log('Could not parse events');
  }
};
