import {db} from './database';
import {espnHandler} from './espn-handler';
import {foxHandler} from './fox-handler';
import {mlbHandler} from './mlb-handler';
import {paramountHandler} from './paramount-handler';
import {b1gHandler} from './b1g-handler';
import {msgHandler} from './msg-handler';
import {floSportsHandler} from './flo-handler';
import {nflHandler} from './nfl-handler';
import {mwHandler} from './mw-handler';
import {nesnHandler} from './nesn-handler';
import {IEntry, IHeaders} from './shared-interfaces';
import {PlaylistHandler} from './playlist-handler';
import {appStatus} from './app-status';
import {removeChannelStatus} from './shared-helpers';
import {calculateChannelNumber} from './channels';

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
    try {
      switch (playingNow.from) {
        case 'foxsports':
          [url, headers] = await foxHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'mlbtv':
          [url, headers] = await mlbHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'paramount+':
          [url, headers] = await paramountHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'msg+':
          [url, headers] = await msgHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'b1g+':
          [url, headers] = await b1gHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'flo':
          [url, headers] = await floSportsHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'nfl+':
          [url, headers] = await nflHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'mountain-west':
          [url, headers] = await mwHandler.getEventData(appStatus.channels[channelId].current);
          break;
        case 'nesn':
          [url, headers] = await nesnHandler.getEventData(appStatus.channels[channelId].current);
          break;
        default:
          [url, headers] = await espnHandler.getEventData(appStatus.channels[channelId].current);
      }
    } catch (e) {}

    if (!url) {
      console.log('Failed to parse the stream');

      // Reset channel state
      removeChannelStatus(channelId);
    } else {
      appStatus.channels[channelId].player = new PlaylistHandler(headers, appUrl, channelId, playingNow.from);

      try {
        await appStatus.channels[channelId].player.initialize(url);
        await checkNextStream(channelId);
      } catch (e) {
        // Reset channel state
        removeChannelStatus(channelId);
      }
    }
  }

  checkingStream[channelId] = false;
};

export const launchChannel = async (channelId: string, appUrl: string): Promise<void> => {
  const channelNum = calculateChannelNumber(channelId);
  const isNumber = Number.isFinite(parseInt(`${channelNum}`, 10));

  if (appStatus.channels[channelId].player || checkingStream[channelId]) {
    return;
  }

  const now = new Date().valueOf();
  const channel = isNumber ? parseInt(`${channelNum}`, 10) : channelNum;
  const playingNow = await db.entries.findOne<IEntry>({
    channel,
    end: {$gt: now},
    start: {$lt: now},
  });

  if (playingNow && playingNow.id) {
    console.log(`Channel #${channelId} has an active event (${playingNow.name}). Going to start the stream.`);
    appStatus.channels[channelId].current = playingNow.id;
    await startChannelStream(channelId, appUrl);
  } else {
    // Reset channel state
    removeChannelStatus(channelId);
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
      console.log(`Channel #${channelId} is scheduled to finish. Removing playlist info.`);
      removeChannelStatus(channelId);
    }, diff);
  }
};
