import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
// import url from 'url';
// import moment from 'moment';

import {okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useBallySports, useBallyPlus} from './networks';
import {getRandomHex} from './shared-helpers';
import {IEntry, IHeaders} from './shared-interfaces';
// import {db} from './database';

type TAdobeAuth = {
  value: string;
  type: string;
  expirationDate: string;
};

const parseAirings = async (events: any[]) => {
  // Fill out
  console.log(events);
};

class BallyHandler {
  public device_id?: string;
  public adobe_auth?: TAdobeAuth;
  public oauth_auth?: any;

  public initialize = async () => {
    if (!useBallySports) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = _.take(getRandomHex(), 16).join('');
      this.save();
    }

    // if (useBallyNetwork && !isAdobeTokenValid(this.adobe_auth)) {
    //   await this.startProviderAuthFlow();
    // }

    if (useBallyPlus) {
      // Start Bally+ auth flow
    }
  };

  public refreshTokens = async () => {
    if (!useBallySports) {
      return;
    }

    // if (useBallyNetwork && willAdobeTokenExpire(this.adobe_auth)) {
    //   console.log('Refreshing TV Provider token (Bally Sports)');
    //   await this.refreshProviderToken();
    // }

    if (useBallyPlus) {
      // Check Bally+ token
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useBallySports) {
      return;
    }

    console.log('Looking for Bally Sports events...');

    try {
      const entries = await this.getEvents();
      await parseAirings(entries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse Bally Sports events');
    }
  };

  public getEventData = async (event: IEntry): Promise<[string, IHeaders]> => {
    return [`${event.id}`, {}];
  };

  private getEvents = async (): Promise<any[]> => {
    return [];
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    const regUrl = ['https://', 'www.ballysports.deltatre.digital', '/api/v2/', 'authorization/adobe/device/code'].join(
      '',
    );

    try {
      const {data} = await axios.post(
        regUrl,
        {
          id: this.device_id,
          type: 'tv_android',
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      console.log('=== TV Provider Auth ===');
      console.log('Please open a browser window and go to: https://www.ballysports.com/activate');
      console.log('Enter code: ', data.code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 60 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode(data.code);
            numOfReqs += 1;

            if (res) {
              clearInterval(regInterval);
              resolve();
            }
          } else {
            clearInterval(regInterval);
            reject();
          }
        };

        const regInterval = setInterval(() => {
          authenticate();
        }, 10 * 1000);

        await authenticate();
      });
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for Bally Sports!');
    }
  };

  private authenticateRegCode = async (regcode: string): Promise<boolean> => {
    const regUrl = ['https://', 'www.ballysports.deltatre.digital', '/api/v2/authorization/adobe/device'].join('');

    try {
      const {data} = await axios.post<TAdobeAuth[]>(
        regUrl,
        {
          code: regcode,
          id: this.device_id,
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.adobe_auth = data[0];
      this.save();

      return true;
    } catch (e) {
      if (e.response?.status !== 400) {
        console.error(e);
        console.log('Could not get provider token data for Bally Sports!');
      }

      return false;
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'nbc_tokens.json'), _.omit(this, 'appConfig'), {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'nbc_tokens.json'))) {
      const {device_id, adobe_auth} = fsExtra.readJSONSync(path.join(configPath, 'nbc_tokens.json'));

      this.device_id = device_id;
      this.adobe_auth = adobe_auth;
    }
  };
}

export const ballyHandler = new BallyHandler();
