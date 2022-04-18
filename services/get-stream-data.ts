import { chromium } from 'playwright';
import _ from 'lodash';

import { sleep } from './sleep';

const pathSelector = 'xpath=//iframe[starts-with(@src,"https://plus.espn.com/en/paywall")]';

export const getStreamData = async (eventId: string) => {
  console.log('Getting stream for event: ', eventId);
  const browser = await chromium.launch({
    channel: 'chrome',
  });
  const context = await browser.newContext({storageState: 'config/state.json'});
  const page = await context.newPage();

  let authToken = null;
  let m3u8 = null;
  let totalTries = 45;
  let currentTry = 0;

  const close = async () => {
    try {
      await page.close();
      await context.storageState({ path: 'config/state.json' });
      await context.close();
      await browser.close();
    } catch (e) {}

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

    if (m3u8 && authToken) {
      console.log('Got stream and credentials');
      await close();
    }
  });

  page.goto(`https://www.espn.com/espnplus/player/_/id/${eventId}`);

  // Check to see if we need to login manually
  page.waitForSelector(pathSelector, { timeout: 0 }).then(async () => {
    page.$(pathSelector).then(async selected => {
      if (!selected) {
        return;
      }

      selected.contentFrame().then(async frame => {
        if (frame) {
          await frame.click('text=Log In');
          await page.waitForSelector('#disneyid-iframe');
          const loginFrame = await (await page.$('#disneyid-iframe')).contentFrame();

          if (loginFrame) {
            await sleep(1000);
            await loginFrame.fill('xpath=//input[@type="email"]', process.env.ESPN_USER);
            await sleep(1000);
            await loginFrame.fill('xpath=//input[@type="password"]', process.env.ESPN_PASS);
            await sleep(1000);
            await loginFrame.click('text=Log In');
          }
        }
      }).catch(() => null);
    }).catch(() => null);
  }).catch(() => null);


  while (!m3u8 || !authToken) {
    if (currentTry >= totalTries) {
      break;
    }
    await sleep(1000);
    currentTry += 1;
  }

  return await close();
};
