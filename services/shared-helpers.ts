import crypto from 'crypto';

import {appStatus} from './app-status';
import {db} from './database';
import {IEntry, IStringObj} from './shared-interfaces';
import moment, {Moment} from 'moment';

const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMnumCharsOPQRSTUVWXYZ0123456789';

export const flipObject = (obj: IStringObj): IStringObj => {
  const ret: IStringObj = {};

  Object.keys(obj).forEach(key => {
    ret[obj[key]] = key;
  });

  return ret;
};

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const generateRandom = (numChars = 8, namespace?: string): string => {
  let nameSpaceFull = '';

  const randomId = Array(numChars)
    .join()
    .split(',')
    .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
    .join('');

  if (namespace && namespace.length) {
    nameSpaceFull = `${namespace}-`;
  }

  return `${nameSpaceFull}${randomId}`;
};

export const getRandomHex = (): string => crypto.randomUUID().replace(/-/g, '');
export const getRandomUUID = (): string => crypto.randomUUID();

export const resetSchedule = async (): Promise<void> => {
  await db.schedule.removeAsync({}, {multi: true});
  await db.entries.updateAsync<IEntry, any>({linear: {$exists: false}}, {$unset: {channel: true}}, {multi: true});
};

export const cleanEntries = async (): Promise<void> => {
  const now = new Date().valueOf();
  await db.entries.removeAsync({end: {$lt: now}}, {multi: true});
};

export const removeAllEntries = async (): Promise<void> => {
  await db.schedule.removeAsync({}, {multi: true});
  await db.entries.removeAsync({}, {multi: true});
};

export const removeChannelStatus = (channelId: string | number): void => {
  try {
    if (appStatus.channels?.[channelId]?.heartbeatTimer) {
      clearTimeout(appStatus.channels[channelId].heartbeatTimer);
    }

    delete appStatus.channels[channelId];
  } catch (e) {
    console.error(e);
    console.log(`Failed to delete info for channel #${channelId}`);
  }
};

export const clearChannels = (): void => {
  Object.keys(appStatus.channels).forEach(key => {
    removeChannelStatus(key);
  });

  appStatus.channels = {};
};

export const normalTimeRange = (): [Moment, Moment] => [moment().subtract(3, 'hours'), moment().add(2, 'days').endOf('day')];
