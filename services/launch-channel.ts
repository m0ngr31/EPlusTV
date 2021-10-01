import { spawn } from 'child_process';
import _ from 'lodash';
import fsExtra from 'fs-extra';
import kill from 'tree-kill';
import path from 'path';
import fs from 'fs';

import { db } from './database';
import { getStreamData } from './get-stream-data';
import { slateStream } from './stream-slate';

let checkingStream = {};

const startChannelStream = async (channelId: string, appStatus, appUrl) => {
  if (appStatus.channels[channelId].pid || checkingStream[channelId]) {
    return;
  }

  checkingStream[channelId] = true;

  let url;
  let authToken;

  try {
    [url, authToken] = await getStreamData(appStatus.channels[channelId].current);
  } catch (e) { }

  checkingStream[channelId] = false;

  if (!url || !authToken) {
    console.log('Failed to parse the stream');
    return;
  }

  console.log('Starting stream');

  const currentM3u8 = slateStream.getSlate('soon', appUrl);

  fs.writeFileSync(path.join(process.cwd(), `tmp/${channelId}/${channelId}.m3u8`), currentM3u8, 'utf8');
  const child = spawn(path.join(process.cwd(), 'stream_channel.sh'), [], {env: {CHANNEL: channelId, URL: url, AUTH_TOKEN: authToken, APP_URL: appUrl}, detached: true, stdio: 'ignore'});
  appStatus.channels[channelId].pid = child.pid;

  child.on('close', () => fsExtra.emptyDirSync(path.join(process.cwd(), `tmp/${channelId}`)));
};

const delayedStart = async (channelId: string, appStatus, appUrl) => {
  if (appStatus.channels[channelId].pid) {
    try {
      appStatus.channels[channelId].pid && kill(appStatus.channels[channelId].pid);
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
  const [entriesDb, scheduleDb, hash] = await db.initCopy();
  const entries = _.sortBy(await entriesDb.find(e => e.channel == channelId && e.end > now), 'start');
  await db.closeCopy(entriesDb, scheduleDb, hash);

  const playingNow = _.find(entries, e => e.start < now);

  if (playingNow) {
    console.log('There is an active event. Going to start the stream.');
    appStatus.channels[channelId].current = playingNow.id;
    startChannelStream(channelId, appStatus, appUrl);
  }
};

export const checkNextStream = async (channelId: string, appStatus, appUrl) => {
  const now = new Date().valueOf();

  if (appStatus.channels[channelId].nextUp) {
    return;
  }

  const [entriesDb, scheduleDb, hash] = await db.initCopy();
  const entries = _.sortBy(await entriesDb.find(e => e.channel == channelId && e.start > now), 'start');
  await db.closeCopy(entriesDb, scheduleDb, hash);

  const now2 = new Date().valueOf();

  if (entries && entries.length > 0 && now - appStatus.channels[channelId].heartbeat < 30 * 1000) {
    const diff = entries[0].start - now2;

    console.log('Channel has upcoming event. Set timer to start');

    appStatus.channels[channelId].nextUp = entries[0].id;
    appStatus.channels[channelId].nextUpTimer = setTimeout(() => delayedStart(channelId, appStatus, appUrl), diff);
  }
};