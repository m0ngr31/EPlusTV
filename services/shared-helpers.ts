import crypto from 'crypto';
import {db} from './database';

import {IStringObj} from './shared-interfaces';

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

export const cleanEntries = async (): Promise<void> => {
  const now = new Date().valueOf();
  await db.entries.remove({end: {$lt: now}}, {multi: true});
};
