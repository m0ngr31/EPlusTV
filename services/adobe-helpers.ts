import crypto from 'crypto';

import {getRandomHex} from './shared-helpers';

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
  authn_expire: number;
}

export const createAdobeAuthHeader = (
  method = 'POST',
  path: string,
  privateKey: string,
  publicKey: string,
  requestor = 'ESPN',
): string => {
  const now = new Date().valueOf();
  const nonce = getRandomHex();

  let message = `${method} requestor_id=${requestor}, nonce=${nonce}, signature_method=HMAC-SHA1, request_time=${now}, request_uri=${path}`;
  const signature = crypto
    .createHmac('sha1', privateKey)
    .update(message)
    .digest()
    .toString('base64');
  message = `${message}, public_key=${publicKey}, signature=${signature}`;

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

  const now = new Date().valueOf();

  try {
    return now < token.authn_expire && now < token.tokenExpiration;
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
