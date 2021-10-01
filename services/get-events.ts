import { webkit } from 'playwright';
import moment from 'moment';

import { db } from './database';

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
      });
    }
  }
};

const responseIntercept = async response => {
  if (response.url().indexOf('watch.graph.api.espn.com/api') > -1) {
    const { data } = await (response as any).json();
    (data && data.airings && data.airings.length) && parseAirings(data.airings);
  }
};

const getEvents = async url => {
  const browser = await webkit.launch();
  const context = await browser.newContext({ storageState: 'config/state.json' });
  const page = await context.newPage();

  page.on('response', responseIntercept);

  await page.goto(url, {
    waitUntil: 'networkidle',
  });

  await context.storageState({ path: 'config/state.json' });
  await context.close();
  await browser.close();
};

export const getEventSchedules = async () => {
  const urls = [
    'https://www.espn.com/espnplus/schedule?channel=ESPN_PLUS',
    'https://www.espn.com/espnplus/schedule/_/type/upcoming/channel/ESPN_PLUS/startDate',
  ];

  const today = new Date();

  for (const [index, url] of urls.entries()) {
    if (!index) {
      console.log('Looking for live events...');
      await getEvents(url);
    } else {
      console.log('Looking for upcoming events...');

      for (const [i] of [1, 2, 3].entries()) {
        const date = moment(today).add(i, 'days');
        await getEvents(`${url}/${date.format('YYYYMMDD')}`)
      }
    }
  }

  console.log('Cleaning up old events');
  const now = new Date().valueOf();
  await db.entries.remove({end: {$lt: now}}, {multi: true});
};
