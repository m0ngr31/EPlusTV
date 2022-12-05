import express from 'express';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import {execSync} from 'child_process';

import {generateM3u} from './services/generate-m3u';
import {cleanupParts} from './services/clean-parts';
import {slateStream} from './services/stream-slate';
import {initDirectories, tmpPath} from './services/init-directories';
import {generateXml} from './services/generate-xmltv';
import {checkNextStream, launchChannel} from './services/launch-channel';
import {getEventSchedules} from './services/get-events';
import {scheduleEntries} from './services/build-schedule';
import {espnHandler} from './services/espn-handler';
import {killChildren} from './services/kill-processes';

const NUM_OF_CHANNELS: number = 100;

let START_CHANNEL = _.toNumber(process.env.START_CHANNEL);
if (_.isNaN(START_CHANNEL)) {
  START_CHANNEL = 1;
}

interface IChannelStatus {
  heartbeat: number;
  pid?: any;
  current?: string;
  nextUp?: string;
  nextUpTimer?: any;
}

interface IAppStatus {
  channels: {
    [string: number]: IChannelStatus
  }
}

const appStatus: IAppStatus = {
  channels: {}
};

const notFound = (_req, res) => res.status(404).send('404 not found');
const shutDown = () => {
  try {
    execSync('killall ffmpeg > /dev/null 2>&1');
  } catch (e) {}

  process.exit(0);
};

const schedule = async () => {
  console.log('=== Getting events ===');
  await getEventSchedules();
  console.log('=== Done getting events ===');
  console.log('=== Building the schedule ===');
  await scheduleEntries(START_CHANNEL);
  console.log('=== Done building the schedule ===');
};

const app = express();

app.get('/channels.m3u', (req, res) => {
  const m3uFile = generateM3u(NUM_OF_CHANNELS, `${req.protocol}://${req.headers.host}`, START_CHANNEL);

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

  let contents = null;

  // Channel heatbeat
  if (!appStatus.channels[id]) {
    appStatus.channels[id] = {};
  }
  appStatus.channels[id].heartbeat = new Date().valueOf();

  if (!fs.existsSync(filename)) {
    contents = slateStream.getSlate('soon', `${req.protocol}://${req.headers.host}`);

    // Start stream
    launchChannel(id, appStatus, `${req.protocol}://${req.headers.host}`);
  }

  if (!contents) {
    try {
      contents = fs.readFileSync(filename);
    } catch (e) {
      console.log(`There was an error reading Channel #${id}'s m3u8...`);

      notFound(req, res);
      return;
    }
  }

  checkNextStream(id, appStatus, `${req.protocol}://${req.headers.host}`);

  res.writeHead(200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'no-cache',
  });
  res.end(contents, 'utf-8');
});

app.get('/channels/:id/:part.ts', (req, res) => {
  const {id, part} = req.params;
  let fileStr;
  let filename;

  const isSlate = id === 'starting' || id === 'soon';

  if (isSlate) {
    fileStr = `slate/${id}/${part}.ts`;
    filename = path.join(process.cwd(), fileStr);
  } else {
    fileStr = `${id}/${part}.ts`;
    filename = path.join(tmpPath, fileStr);

    // Channel heatbeat
    if (!appStatus.channels[id]) {
      appStatus.channels[id] = {};
    }
    appStatus.channels[id].heartbeat = new Date().valueOf();
  }

  if (!fs.existsSync(filename)) {
    console.log('Error opening part: ', filename);

    notFound(req, res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'video/MP2T',
    'Cache-Control': 'no-cache',
  });
  const stream = fs.createReadStream(filename);
  stream.pipe(res);
});

// 404 Handler
app.use(notFound);


process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);


(async () => {
  initDirectories(NUM_OF_CHANNELS, START_CHANNEL);

  await espnHandler.initialize();
  await espnHandler.refreshTokens();
  await schedule();

  console.log('=== Starting Server ===')
  app.listen(8000, () => console.log('Server started on port 8000'));
})();


// Cleanup intervals
setInterval(() => {
  // Delete old TS files after 120 seconds
  cleanupParts();

  // Check for channel heartbeat and kill any streams that aren't being used
  const now = new Date().valueOf();
  _.forOwn(appStatus.channels, val => {
    if (now - val.heartbeat > 120 * 1000) {
      if (val.pid) {
        console.log('Killing unwatched stream with PID: ', val.pid);
        try {
          killChildren(val.pid);
          val.pid = null;
          val.current = null;
        } catch (e) {}
      }

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
}, 1000 * 60 * 30);
