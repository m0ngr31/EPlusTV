import express from 'express';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';

import {generateM3u} from './services/generate-m3u';
import {cleanupParts} from './services/clean-parts';
import {slateStream} from './services/stream-slate';
import {initDirectories, tmpPath} from './services/init-directories';
import {generateXml} from './services/generate-xmltv';
import {checkNextStream, launchChannel} from './services/launch-channel';
import {getEventSchedules} from './services/get-espn-events';
import {scheduleEntries} from './services/build-schedule';
import {espnHandler} from './services/espn-handler';
import {foxHandler} from './services/fox-handler';
import {getFoxEventSchedules} from './services/get-fox-events';
import {IAppStatus} from './services/shared-interfaces';
import {nbcHandler} from './services/nbc-handler';
import {getNbcEventSchedules} from './services/get-nbc-events';
import {cleanEntries} from './services/shared-helpers';

const NUM_OF_CHANNELS = 100;

let START_CHANNEL = _.toNumber(process.env.START_CHANNEL);
if (_.isNaN(START_CHANNEL)) {
  START_CHANNEL = 1;
}

const appStatus: IAppStatus = {
  channels: {},
};

const notFound = (_req, res) => res.status(404).send('404 not found');
const shutDown = () => process.exit(0);

const schedule = async () => {
  console.log('=== Getting events ===');
  await getEventSchedules();
  await getFoxEventSchedules();
  await getNbcEventSchedules();
  console.log('=== Done getting events ===');
  console.log('=== Building the schedule ===');
  await scheduleEntries(START_CHANNEL);
  console.log('=== Done building the schedule ===');
};

const app = express();

app.get('/channels.m3u', (req, res) => {
  const m3uFile = generateM3u(
    NUM_OF_CHANNELS,
    `${req.protocol}://${req.headers.host}`,
    START_CHANNEL,
  );

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
  const xmlFile = await generateXml(NUM_OF_CHANNELS, START_CHANNEL);

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
  const fileStr = `${id}/${id}.m3u8`;
  const filename = path.join(tmpPath, fileStr);

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/vnd.apple.mpegurl',
  });

  let contents = null;

  // Channel heatbeat
  if (!appStatus.channels[id]) {
    appStatus.channels[id] = {};
  }
  appStatus.channels[id].heartbeat = new Date().valueOf();

  if (!fs.existsSync(filename)) {
    contents = slateStream.getSlate(
      'soon',
      `${req.protocol}://${req.headers.host}`,
    );

    // Start stream
    launchChannel(id, appStatus, `${req.protocol}://${req.headers.host}`);

    res.end(contents, 'utf-8');
  } else {
    fs.createReadStream(filename).pipe(res);
  }

  checkNextStream(id, appStatus, `${req.protocol}://${req.headers.host}`);
});

app.get('/channels/:id/:part.key', async (req, res) => {
  const {id, part} = req.params;
  const fileStr = `${id}/${part}.key`;
  const filename = path.join(tmpPath, fileStr);

  if (!fs.existsSync(filename)) {
    await appStatus.channels[id].player.getKey(part);
  }

  const fileData = fs.statSync(filename);

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Length': fileData.size,
    'Content-Type': 'application/octet-stream',
  });
  fs.createReadStream(filename).pipe(res);
});

app.get('/channels/:id/:part.ts', async (req, res) => {
  const {id, part} = req.params;
  let fileStr;
  let filename;

  const isSlate = id === 'starting' || id === 'soon';

  if (isSlate) {
    fileStr = `slate/${id}/${part.replace(/[0-9]+-/, '')}.ts`;
    filename = path.join(process.cwd(), fileStr);
  } else {
    fileStr = `${id}/${part}.ts`;
    filename = path.join(tmpPath, fileStr);

    if (appStatus.channels[id]) {
      await appStatus.channels[id].player.getSegment(part);
      appStatus.channels[id].heartbeat = new Date().valueOf();
    }
  }

  if (!fs.existsSync(filename)) {
    console.log('Error opening segment: ', filename);

    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'video/MP2T',
  });
  fs.createReadStream(filename).pipe(res);
});

// 404 Handler
app.use(notFound);

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

(async () => {
  initDirectories(NUM_OF_CHANNELS, START_CHANNEL);

  await espnHandler.initialize();
  await espnHandler.refreshTokens();

  await foxHandler.initialize();
  await foxHandler.refreshTokens();

  await nbcHandler.initialize();
  await nbcHandler.refreshTokens();

  await cleanEntries();
  await schedule();

  console.log('=== Starting Server ===');
  app.listen(8000, () => console.log('Server started on port 8000'));
})();

// Cleanup intervals
setInterval(() => {
  // Delete old TS files after 120 seconds
  cleanupParts();

  // Check for channel heartbeat and kill any streams that aren't being used
  const now = new Date().valueOf();
  _.forOwn(appStatus.channels, (val, key) => {
    if (!val.heartbeat) {
      return;
    }

    if (now - val.heartbeat > 120 * 1000) {
      val.player && val.player.stop();
      console.log('Killing unwatched channel: ', key);
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
