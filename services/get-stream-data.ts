import { chromium } from 'playwright';
import _ from 'lodash';

import { sleep } from './sleep';

export const getStreamData = async (eventId: string) => {
  console.log('Getting stream for event: ', eventId);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });
  const context = await browser.newContext({storageState: 'config/state.json'});
  const page = await context.newPage();

  let authToken = null;
  let m3u8 = null;
  let totalTries = 1000;
  let currentTry = 0;

  const close = async () => {
    await context.storageState({ path: 'config/state.json' });
    await context.close();
    await browser.close();
    return [m3u8, authToken];
  };

  page.on('request', async request => {
    if (request.url().indexOf('keys') > -1 && !authToken) {
      const isAuthToken = await request.headerValue('Authorization');
      authToken = isAuthToken && isAuthToken;
    }

    if (request.url().endsWith('m3u8') && request.url().indexOf('master') > -1 && !m3u8) {
      m3u8 = request.url();
    }
  });

  await page.goto(`https://www.espn.com/espnplus/player/_/id/${eventId}`, {
    waitUntil: 'domcontentloaded',
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
    return await close();
  }

  try {
    // Not logged in, do it manually
    const pathSelector = 'xpath=//iframe[starts-with(@id,"btm_activity")]';
    await page.waitForSelector(pathSelector);
    const frame = await (await page.$(pathSelector)).contentFrame();

    if (frame) {
      await frame.click('text=Log In');
      await sleep(1000);
      await page.keyboard.type(process.env.ESPN_USER);
      await page.keyboard.press('Tab');
      await page.keyboard.type(process.env.ESPN_PASS);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Space');
    }
  } catch (e) {}

  totalTries = 1500;
  currentTry = 0;

  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(10);
    currentTry += 1;
  }

  return await close();
};
