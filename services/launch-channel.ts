import { spawn } from 'child_process';
import _ from 'lodash';
import fsExtra from 'fs-extra';
import path from 'path';
import fs from 'fs';

import { db } from './database';
import { slateStream } from './stream-slate';
import { tmpPath } from './init-directories';
import { sleep } from './sleep';
import { espnHandler } from './espn-handler';
import { killChildren } from './kill-processes';
import { userAgent } from './user-agent';

const VALID_RESOLUTIONS = [
  '720p60',
  '720p',
  '540p',
];

const getStreamVideoMap = (isEspnPlus = true) => {
  const setProfile = _.includes(VALID_RESOLUTIONS, process.env.STREAM_RESOLUTION) ? process.env.STREAM_RESOLUTION : '720p60';

  if (isEspnPlus) {
    switch (setProfile) {
      case '720p60':
        return '0:32?';
      case '720p':
        return '0:24?';
      default:
        return '0:20?';
    }
  } else {
    switch (setProfile) {
      case '720p60':
        return '0:7?';
      case '720p':
        return '0:1?';
      default:
        return '0:16?';
    }
  }
};

const getStreamAudioMap = (isEspnPlus = true) => {
  const setProfile = _.includes(VALID_RESOLUTIONS, process.env.STREAM_RESOLUTION) ? process.env.STREAM_RESOLUTION : '720p60';

  if (isEspnPlus) {
    switch (setProfile) {
      case '720p60':
        return '0:33?';
      case '720p':
        return '0:25?';
      default:
        return '0:21?';
    }
  } else {
    switch (setProfile) {
      case '720p60':
        return '0:6?';
      case '720p':
        return '0:0?';
      default:
        return '0:15?';
    }
  }
};

let checkingStream = {};

const startChannelStream = async (channelId: string, appStatus, appUrl) => {
  if (appStatus.channels[channelId].pid || checkingStream[channelId]) {
    return;
  }

  checkingStream[channelId] = true;

  let url;
  let authToken;
  let isEspnPlus;

  try {
    [url, authToken, isEspnPlus] = await espnHandler.getEventData(appStatus.channels[channelId].current);
  } catch (e) {}

  checkingStream[channelId] = false;

  if (!url || !authToken) {
    console.log('Failed to parse the stream');
    return;
  }

  const currentM3u8 = slateStream.getSlate('soon', appUrl);

  fs.writeFileSync(path.join(tmpPath, `${channelId}/${channelId}.m3u8`), currentM3u8, 'utf8');

  const out = fs.openSync(path.join(tmpPath, `${channelId}-log.txt`), 'a');
  const child = spawn(path.join(process.cwd(), 'stream_channel.sh'), [], {env: {CHANNEL: channelId, URL: url, AUTH_TOKEN: authToken, APP_URL: appUrl, VIDEO_MAP: getStreamVideoMap(isEspnPlus), AUDIO_MAP: getStreamAudioMap(isEspnPlus), USER_AGENT: userAgent}, detached: true, stdio: ['ignore', out, out]});

  appStatus.channels[channelId].pid = child.pid;

  console.log(`Stream for Channel ${channelId} started on PID: `, child.pid);

  child.on('close', async () => {
    console.log(`Stream for Channel ${channelId} stopped.`);
    await sleep(2000);
    fsExtra.emptyDirSync(path.join(tmpPath, `${channelId}`));
  });
};

const delayedStart = async (channelId: string, appStatus, appUrl) => {
  if (appStatus.channels[channelId].pid) {
    try {
      appStatus.channels[channelId].pid && killChildren(appStatus.channels[channelId].pid);
      appStatus.channels[channelId].pid = null;
    } catch (e) {}
  }
  appStatus.channels[channelId].current = appStatus.channels[channelId].nextUp;

  clearTimeout(appStatus.channels[channelId].nextUpTimer);
  appStatus.channels[channelId].nextUp = null;
  appStatus.channels[channelId].nextUpTimer = null;

  startChannelStream(channelId, appStatus, appUrl);
}

export const launchChannel = async (channelId: string, appStatus, appUrl) => {
  if (appStatus.channels[channelId].pid || checkingStream[channelId]) {
    return;
  }

  const now = new Date().valueOf();
  const channel = parseInt(channelId, 10);
  const playingNow = await db.entries.findOne({channel, end: {$gt: now}, start: {$lt: now}});

  if (playingNow && (playingNow as any).id) {
    console.log('There is an active event. Going to start the stream.');
    appStatus.channels[channelId].current = (playingNow as any).id;
    startChannelStream(channelId, appStatus, appUrl);
  }
};

export const checkNextStream = async (channelId: string, appStatus, appUrl) => {
  const now = new Date().valueOf();

  if (appStatus.channels[channelId].nextUp) {
    return;
  }

  const channel = parseInt(channelId, 10);
  const entries = await db.entries.find({channel, start: {$gt: now}}).sort({start: 1});

  const now2 = new Date().valueOf();

  if (entries && entries.length > 0 && now - appStatus.channels[channelId].heartbeat < 30 * 1000) {
    const diff = (entries[0] as any).start - now2;

    console.log('Channel has upcoming event. Setting timer to start');

    appStatus.channels[channelId].nextUp = (entries[0] as any).id;
    appStatus.channels[channelId].nextUpTimer = setTimeout(() => delayedStart(channelId, appStatus, appUrl), diff);
  }
};