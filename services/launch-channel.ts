import {db} from './database';
import {espnHandler} from './espn-handler';
import {foxHandler} from './fox-handler';
import {mlbHandler} from './mlb-handler';
import {IEntry, IHeaders} from './shared-interfaces';
import {PlaylistHandler} from './playlist-handler';
import {appStatus} from './app-status';
import {removeChannelStatus} from './shared-helpers';

const checkingStream = {};

const startChannelStream = async (channelId: string, appUrl: string) => {
  if (appStatus.channels[channelId].player || checkingStream[channelId]) {
    return;
  }

  checkingStream[channelId] = true;

  let url;
  let headers: IHeaders;

  const playingNow = await db.entries.findOne<IEntry>({
    id: appStatus.channels[channelId].current,
  });

  if (playingNow) {
    const network = playingNow.from === 'foxsports' ? 'foxsports' : playingNow.from === 'mlbtv' ? 'mlbtv' : 'espn';

    if (network === 'foxsports') {
      try {
        [url, headers] = await foxHandler.getEventData(appStatus.channels[channelId].current);
      } catch (e) {}
    } else if (network === 'mlbtv') {
      try {
        [url, headers] = await mlbHandler.getEventData(playingNow);
      } catch (e) {}
    } else {
      try {
        [url, headers] = await espnHandler.getEventData(appStatus.channels[channelId].current);
      } catch (e) {}
    }

    if (!url) {
      console.log('Failed to parse the stream');
    } else {
      appStatus.channels[channelId].player = new PlaylistHandler(headers, appUrl, channelId, network);

      try {
        await appStatus.channels[channelId].player.initialize(url);
        await checkNextStream(channelId);
      } catch (e) {
        appStatus.channels[channelId].player = undefined;
      }
    }
  }

  checkingStream[channelId] = false;
};

export const launchChannel = async (channelId: string, appUrl: string): Promise<void> => {
  if (appStatus.channels[channelId].player || checkingStream[channelId]) {
    return;
  }

  const now = new Date().valueOf();
  const channel = parseInt(channelId, 10);
  const playingNow = await db.entries.findOne<IEntry>({
    channel,
    end: {$gt: now},
    start: {$lt: now},
  });

  if (playingNow && playingNow.id) {
    console.log(`Channel #${channelId} has an active event (${playingNow.name}). Going to start the stream.`);
    appStatus.channels[channelId].current = playingNow.id;
    await startChannelStream(channelId, appUrl);
  }
};

export const checkNextStream = async (channelId: string): Promise<void> => {
  if (appStatus.channels[channelId].heartbeatTimer) {
    return;
  }

  const now = new Date().valueOf();

  const channel = parseInt(channelId, 10);
  const entries = await db.entries.find<IEntry>({channel, start: {$gt: now}}).sort({start: 1});

  if (entries && entries.length > 0) {
    const diff = entries[0].start - now;

    appStatus.channels[channelId].heartbeatTimer = setTimeout(() => {
      console.log(`Channel ${channelId} is scheduled to finish. Removing playlist info`);
      removeChannelStatus(channelId);
    }, diff);
  }
};
