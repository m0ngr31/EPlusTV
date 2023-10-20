import express from 'express';
import moment from 'moment';

import {generateM3u} from './services/generate-m3u';
import {initDirectories} from './services/init-directories';
import {generateXml} from './services/generate-xmltv';
import {launchChannel} from './services/launch-channel';
import {scheduleEntries} from './services/build-schedule';
import {espnHandler} from './services/espn-handler';
import {foxHandler} from './services/fox-handler';
import {mlbHandler} from './services/mlb-handler';
import {cleanEntries, removeChannelStatus} from './services/shared-helpers';
import {appStatus} from './services/app-status';
import {SERVER_PORT} from './services/port';

import {version} from './package.json';

const notFound = (_req, res) => res.status(404).send('404 not found');
const shutDown = () => process.exit(0);

const schedule = async (firstRun = true) => {
  console.log('=== Getting events ===');
  await espnHandler.getSchedule();
  await foxHandler.getSchedule();
  await mlbHandler.getSchedule();
  console.log('=== Done getting events ===');
  await cleanEntries();
  console.log('=== Building the schedule ===');
  await scheduleEntries(firstRun);
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

  // Channel data needs initial object
  if (!appStatus.channels[id]) {
    appStatus.channels[id] = {
      heartbeat: new Date(),
    };
  }

  const uri = `${req.protocol}://${req.headers.host}`;

  if (!appStatus.channels[id].player?.playlist) {
    try {
      await launchChannel(id, uri);
    } catch (e) {}
  }

  try {
    contents = appStatus.channels[id].player?.playlist;
  } catch (e) {}

  if (!contents) {
    console.log(
      `Could not get a playlist for channel #${id}. Please make sure there is an event scheduled and you have access to it.`,
    );
    notFound(req, res);
    return;
  }

  appStatus.channels[id].heartbeat = new Date();

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/vnd.apple.mpegurl',
  });
  res.end(contents, 'utf-8');
});

app.get('/chunklist/:id/:chunklistid.m3u8', async (req, res) => {
  const {id, chunklistid} = req.params;

  let contents = null;

  if (!appStatus.channels[id]?.player?.playlist) {
    notFound(req, res);
    return;
  }

  try {
    contents = await appStatus.channels[id].player.cacheChunklist(chunklistid);
  } catch (e) {}

  if (!contents) {
    console.log(`Could not get chunklist for channel #${id}.`);
    notFound(req, res);
    return;
  }

  appStatus.channels[id].heartbeat = new Date();

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/vnd.apple.mpegurl',
  });
  res.end(contents, 'utf-8');
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

  appStatus.channels[id].heartbeat = new Date();

  res.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/octet-stream',
  });
  res.end(contents, 'utf-8');
});

app.get('/channels/:id/:part.ts', async (req, res) => {
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
    'Content-Type': 'video/MP2T',
  });
  res.end(contents, 'utf-8');
});

// 404 Handler
app.use(notFound);

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

(async () => {
  console.log(`=== E+TV v${version} starting ===`);
  initDirectories();

  await espnHandler.initialize();
  await espnHandler.refreshTokens();

  await foxHandler.initialize();
  await foxHandler.refreshTokens();

  await mlbHandler.initialize();
  await mlbHandler.refreshTokens();

  await schedule();

  console.log('=== Starting Server ===');
  app.listen(SERVER_PORT, () => console.log(`Server started on port ${SERVER_PORT}`));
})();

// Check for events every 4 hours and set the schedule
setInterval(async () => {
  await schedule(false);
}, 1000 * 60 * 60 * 4);

// Check for updated refresh tokens 30 minutes
setInterval(async () => {
  await espnHandler.refreshTokens();
  await foxHandler.refreshTokens();
  await mlbHandler.refreshTokens();
}, 1000 * 60 * 30);

// Remove idle playlists
setInterval(() => {
  const now = moment();

  for (const key of Object.keys(appStatus.channels)) {
    if (appStatus.channels[key] && appStatus.channels[key].heartbeat) {
      const channelHeartbeat = moment(appStatus.channels[key].heartbeat);

      if (now.diff(channelHeartbeat, 'minutes') > 5) {
        console.log(`Channel #${key} has been idle for more than 5 minutes. Removing playlist info.`);
        removeChannelStatus(key);
      }
    } else {
      console.log(`Channel #${key} was setup improperly... Removing.`);
      removeChannelStatus(key);
    }
  }
}, 1000 * 60);
