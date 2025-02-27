import crypto from 'crypto';
import axios from 'axios';
import moment, {Moment} from 'moment';
import sharp from 'sharp';

import {appStatus} from './app-status';
import {db} from './database';
import {IEntry, IStringObj} from './shared-interfaces';

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

export const normalTimeRange = (): [Moment, Moment] => [
  moment().subtract(2, 'hours'),
  moment().add(2, 'days').endOf('day'),
];

export const downloadImage = async (url: string): Promise<Buffer> => {
  const response = await axios({
    responseType: 'arraybuffer',
    url,
  });

  return Buffer.from(response.data, 'binary');
};

export const combineImages = async (url1: string, url2: string): Promise<string> => {
  const [image1, image2] = await Promise.all([downloadImage(url1), downloadImage(url2)]);

  const img1 = sharp(image1);
  const img2 = sharp(image2);

  const [metadata1, metadata2] = await Promise.all([img1.metadata(), img2.metadata()]);
  const [buffer1, buffer2] = await Promise.all([img1.toBuffer(), img2.toBuffer()]);

  const combinedWidth = metadata1.width + metadata2.width + 48;
  const maxHeight = Math.max(metadata1.height, metadata2.height) + 24;

  const combinedImage = sharp({
    create: {
      background: {
        alpha: 0,
        b: 0,
        g: 0,
        r: 0,
      },
      channels: 4,
      height: maxHeight,
      width: combinedWidth,
    },
  })
    .composite([
      {
        input: buffer1,
        left: 12,
        top: 12,
      },
      {
        input: buffer2,
        left: 36 + metadata1.width,
        top: 12,
      },
    ])
    .png();

  const combinedBuffer = await combinedImage.toBuffer();

  return `data:image/png;base64,${combinedBuffer.toString('base64')}`;
};
