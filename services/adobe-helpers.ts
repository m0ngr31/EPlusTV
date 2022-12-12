import crypto from 'crypto';

import {getRandomHex} from './generate-random';

export interface IAdobeAuth {
  expires: string;
  mvpd: string;
  requestor: string;
  userId: string;
}

export interface IAdobeAuthFox {
  accessToken: string;
  tokenExpiration: number;
  mvpd: string;
}

const ADOBE_KEY = [
  'g',
  'B',
  '8',
  'H',
  'Y',
  'd',
  'E',
  'P',
  'y',
  'e',
  'z',
  'e',
  'Y',
  'b',
  'R',
  '1',
].join('');

const ADOBE_PUBLIC_KEY = [
  'y',
  'K',
  'p',
  's',
  'H',
  'Y',
  'd',
  '8',
  'T',
  'O',
  'I',
  'T',
  'd',
  'T',
  'M',
  'J',
  'H',
  'm',
  'k',
  'J',
  'O',
  'V',
  'm',
  'g',
  'b',
  'b',
  '2',
  'D',
  'y',
  'k',
  'N',
  'K',
].join('');

export const createAdobeAuthHeader = (
  method = 'POST',
  path: string,
): string => {
  const now = new Date().valueOf();
  const nonce = getRandomHex();

  let message = `${method} requestor_id=ESPN, nonce=${nonce}, signature_method=HMAC-SHA1, request_time=${now}, request_uri=${path}`;
  const signature = crypto
    .createHmac('sha1', ADOBE_KEY)
    .update(message)
    .digest()
    .toString('base64');
  message = `${message}, public_key=${ADOBE_PUBLIC_KEY}, signature=${signature}`;

  return message;
};

export const isAdobeTokenValid = (token?: IAdobeAuth): boolean => {
  if (!token) return false;

  try {
    const parsedExp = parseInt(token.expires, 10);
    return new Date().valueOf() < new Date(parsedExp).valueOf();
  } catch (e) {
    return false;
  }
};

export const isAdobeFoxTokenValid = (token?: IAdobeAuthFox): boolean => {
  if (!token) return false;

  try {
    return new Date().valueOf() < token.tokenExpiration;
  } catch (e) {
    return false;
  }
};

export const willAdobeTokenExpire = (token?: IAdobeAuth): boolean => {
  if (!token) return true;

  try {
    const parsedExp = parseInt(token.expires, 10);
    // Will the token expire in the next hour?
    return new Date().valueOf() + 3600 * 1000 > new Date(parsedExp).valueOf();
  } catch (e) {
    return true;
  }
};
