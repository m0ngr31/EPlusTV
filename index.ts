import express from 'express';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';

import {generateM3u} from './services/generate-m3u';
import {getSlate, USE_SLATE} from './services/stream-slate';
import {initDirectories} from './services/init-directories';
import {generateXml} from './services/generate-xmltv';
import {checkNextStream, launchChannel} from './services/launch-channel';
import {getEventSchedules} from './services/get-espn-events';
import {scheduleEntries} from './services/build-schedule';
import {espnHandler} from './services/espn-handler';
import {foxHandler} from './services/fox-handler';
import {getFoxEventSchedules} from './services/get-fox-events';
import {nbcHandler} from './services/nbc-handler';
import {getNbcEventSchedules} from './services/get-nbc-events';
import {cleanEntries, sleep} from './services/shared-helpers';
import {appStatus} from './services/app-status';

import {version} from './package.json';

const notFound = (_req, res) => res.status(404).send('404 not found');
const shutDown = () => process.exit(0);

const schedule = async () => {
  console.log('=== Getting events ===');
  await getEventSchedules();
  await getFoxEventSchedules();
  await getNbcEventSchedules();
  console.log('=== Done getting events ===');
  await cleanEntries();
  console.log('=== Building the schedule ===');
  await scheduleEntries();
  console.log('=== Done building the schedule ===');
};

const app = express();

app.get('/channels.m3u', (req, res) => {
  const m3uFile = generateM3u(`${req.protocol}://${req.headers.host}`);

  if (!m3uFile) {
    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-mpegurl',
  });
  res.end(m3uFile, 'utf-8');
});

app.get('/xmltv.xml', async (req, res) => {
  const xmlFile = await generateXml();

  if (!xmlFile) {
    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/xml',
  });
  res.end(xmlFile, 'utf-8');
});

app.get('/channels/:id.m3u8', async (req, res) => {
  const {id} = req.params;

  let contents = null;

  // Channel heatbeat
  if (!appStatus.channels[id]) {
    appStatus.channels[id] = {};
  }

  appStatus.channels[id].heartbeat = new Date().valueOf();

  const uri = `${req.protocol}://${req.headers.host}`;

  if (USE_SLATE) {
    if (!appStatus.channels[id].player?.m3u8) {
      contents = getSlate(uri);

      // Start stream
      launchChannel(id, uri);
    } else {
      contents = appStatus.channels[id].player?.m3u8;
    }
  } else {
    while (!appStatus.channels[id].player?.m3u8) {
      // Start stream
      launchChannel(id, uri);
      // Keep sleeping until the stream starts
      await sleep(250);
    }

    contents = appStatus.channels[id].player?.m3u8;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/vnd.apple.mpegurl',
  });
  res.end(contents, 'utf-8');

  checkNextStream(id, `${req.protocol}://${req.headers.host}`);
});

app.get('/channels/:id/:part.key', async (req, res) => {
  const {id, part} = req.params;
  let contents;

  try {
    contents = await appStatus.channels[id].player.getSegmentOrKey(part);
  } catch (e) {
    notFound(req, res);
    return;
  }

  if (!contents) {
    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/octet-stream',
  });
  res.end(contents, 'utf-8');
});

app.get('/channels/:id/:part.ts', async (req, res) => {
  const {id, part} = req.params;
  let contents;

  const isSlate = id === 'starting';

  if (isSlate) {
    const fileStr = `slate/${id}/${part}.ts`;
    const filename = path.join(process.cwd(), fileStr);

    contents = fs.readFileSync(filename);
  } else {
    try {
      contents = await appStatus.channels[id].player.getSegmentOrKey(part);
    } catch (e) {
      notFound(req, res);
      return;
    }
  }

  if (!contents) {
    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'video/MP2T',
  });
  res.end(contents, 'utf-8');
});

// 404 Handler
app.use(notFound);

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

(async () => {
  console.log(`=== EPlusTV v${version} starting ===`);
  initDirectories();

  await espnHandler.initialize();
  await espnHandler.refreshTokens();

  await foxHandler.initialize();
  await foxHandler.refreshTokens();

  await nbcHandler.initialize();
  await nbcHandler.refreshTokens();

  await schedule();

  console.log('=== Starting Server ===');
  app.listen(8000, () => console.log('Server started on port 8000'));
})();

// Cleanup intervals
setInterval(() => {
  // Check for channel heartbeat and kill any streams that aren't being used
  const now = new Date().valueOf();
  _.forOwn(appStatus.channels, (val, key) => {
    if (!val.heartbeat) {
      return;
    }

    if (now - val.heartbeat > 120 * 1000) {
      if (val.player) {
        console.log('Killing unwatched channel: ', key);
        val.player.stop();
      }
      val.current = null;
      val.player = null;
      val.nextUp && val.nextUpTimer && clearTimeout(val.nextUpTimer);
      val.nextUp = null;
      val.nextUpTimer = null;
      val.heartbeat = null;
    }
  });
}, 60 * 1000);

// Check for events every 4 hours and set the schedule
setInterval(async () => {
  await schedule();
}, 1000 * 60 * 60 * 4);

// Check for updated refresh tokens 30 minutes
setInterval(async () => {
  await espnHandler.refreshTokens();
  await foxHandler.refreshTokens();
  await nbcHandler.refreshTokens();
}, 1000 * 60 * 30);
