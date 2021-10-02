import { firefox } from 'playwright';
import _ from 'lodash';

import { sleep } from './sleep';

export const getStreamData = async (eventId: string) => {
  console.log('Getting stream for event: ', eventId);
  const browser = await firefox.launch();
  const context = await browser.newContext({storageState: 'config/state.json'});
  const page = await context.newPage();

  let authToken = null;
  let m3u8 = null;
  let totalTries = 500;
  let currentTry = 0;

  page.on('request', async request => {
    if (request.url().indexOf('keys') > -1) {
      authToken = await request.headerValue('Authorization');
    }

    if (request.url().endsWith('m3u8') && request.url().indexOf('master') > -1) {
      m3u8 = request.url();
    }
  });

  await page.goto(`https://www.espn.com/espnplus/player/_/id/${eventId}`, {
    waitUntil: 'networkidle',
  });

  // Check to see if we're logged in
  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(10);
    currentTry += 1;
  }

  if (m3u8 && authToken) {
    console.log('Got credentials from local storage');
    await context.storageState({ path: 'config/state.json' });
    await context.close();
    await browser.close();
    return [m3u8, authToken];
  }

  try {
    // Not logged in, do it manually
    const pathSelector = 'xpath=//iframe[starts-with(@id,"btm_activity")]';
    await page.waitForSelector(pathSelector);
    const frame = await (await page.$(pathSelector)).contentFrame();

    if (frame) {
      await frame.click('text=Log In');
      await sleep(500);
      await page.keyboard.press('Tab');
      await page.keyboard.type(process.env.ESPN_USER);
      await page.keyboard.press('Tab');
      await page.keyboard.type(process.env.ESPN_PASS);
      await page.keyboard.press('Enter');
    }
  } catch (e) {}

  totalTries = 1000;
  currentTry = 0;

  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(10);
    currentTry += 1;
  }

  await context.storageState({ path: 'config/state.json' });
  await context.close();
  await browser.close();

  if (currentTry === totalTries) {
    return [null, null];
  }

  return [m3u8, authToken];
};
