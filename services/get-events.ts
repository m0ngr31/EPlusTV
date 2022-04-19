import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import moment from 'moment';

import { db } from './database';
import { sleep } from './sleep';

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

const getEvents = async url => {
  const browser = await chromium.launch({
    channel: 'chrome',
  });
  const context = await browser.newContext({storageState: 'config/state.json'});
  const page = await context.newPage();

  page.on('response', async response => {
    if (response.url().startsWith('https://watch.graph.api.espn.com/api?')) {
      try {
        const {data} = await (response as any).json();
        (data && data.airings && data.airings.length) && await parseAirings(data.airings);
        hasSucceeded = true;
      } catch (e) {}
    }
  });

  let hasSucceeded = false;
  let waitTries = 0;
  let waitTriesMax = 300;
  let pageTries = 0;
  let pageTriesMax = 3;

  while (!hasSucceeded && pageTries < pageTriesMax) {
    waitTries = 0;

    page.goto(url).catch(() => null);

    while (!hasSucceeded && waitTries < waitTriesMax) {
      await sleep(100);
      waitTries += 1;
    }

    if (!hasSucceeded) {
      pageTries += 1;
    }
  }

  try {
    await page.close();
    await context.storageState({path: 'config/state.json'});
    await context.close();
    await browser.close();
  } catch (e) {}
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
      try {
        await getEvents(url);
      } catch (e) {
        console.log("Couldn't get live events");
      }
    } else {
      console.log('Looking for upcoming events...');

      for (const [i] of [1, 2, 3].entries()) {
        const date = moment(today).add(i, 'days');

        try {
          await getEvents(`${url}/${date.format('YYYYMMDD')}`)
        } catch (e) {
          console.log(`Couldn't get events for ${date.format('dddd, MMMM Do YYYY')}`)
        }
      }
    }
  }

  spawn(path.join(process.cwd(), 'kill_chrome_processes.sh'), []);

  console.log('Cleaning up old events');
  const now = new Date().valueOf();
  await db.entries.remove({end: {$lt: now}}, {multi: true});
};
