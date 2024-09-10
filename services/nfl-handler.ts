import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useNflPlus} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';
import {useLinear} from './channels';

interface INFLRes {
  data: {
    items: INFLEvent[];
  };
}

interface INFLEvent {
  title: string;
  startTime: string;
  endTime: string;
  preferredImage: string;
  externalId: string;
  duration: number;
  dmaCodes: string[];
  contentType: string;
  language: string[];
  description: string;
  callSign: string;
  linear: boolean;
}

const CLIENT_KEY = [
  '0',
  'q',
  '1',
  'p',
  '5',
  'K',
  'S',
  's',
  'v',
  't',
  'u',
  '2',
  'V',
  'J',
  'f',
  'k',
  '5',
  'v',
  'Q',
  '5',
  'E',
  'd',
  'p',
  'm',
  'N',
  'N',
  'G',
  'r',
  'C',
  'G',
  'U',
  '7',
].join('');

const CLIENT_SECRET = ['q', 'G', 'h', 'E', 'v', '1', 'R', 't', 'I', '2', 'S', 'f', 'R', 'Q', 'O', 'e'].join('');

const DEVICE_INFO = {
  capabilities: {},
  ctvDevice: 'AndroidTV',
  diskCapacity: 118550667264,
  displayHeight: 2340,
  displayWidth: 1080,
  idfv: 'unknown',
  isLocationEnabled: true,
  manufacturer: 'Google',
  memory: 7824363520,
  model: 'Pixel_5',
  networkType: 'wifi',
  osName: 'Android',
  osVersion: '13',
  vendor: 'google',
  version: 'redfin',
  versionName: '59.0.29.1346644',
};

const DEFAULT_CATEGORIES = ['NFL', 'NFL+', 'Football'];

const parseAirings = async (events: INFLEvent[]) => {
  const now = moment();

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.externalId});

    if (!entryExists) {
      const start = moment(event.startTime);
      const end = moment(start).add(event.duration, 'seconds');

      const isLinear = useLinear && (event.callSign === 'NFLNETWORK' || event.callSign === 'NFLNRZ');

      if (!isLinear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now)) {
        continue;
      }

      const gameName = event.title;
      console.log('Adding event: ', gameName);

      const categories = [...DEFAULT_CATEGORIES];

      if (gameName.indexOf(' at ') > -1) {
        const [home, away] = gameName.split(' at ');
        categories.push(home, away);
      }

      await db.entries.insert<IEntry>({
        categories: [...new Set(categories)],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'nfl+',
        id: event.externalId,
        image: event.preferredImage,
        name: gameName,
        network: 'NFL+',
        sport: 'NFL',
        start: start.valueOf(),
        ...(isLinear && {
          channel: event.callSign,
          linear: true,
          replay: event.callSign === 'NFLNETWORK',
        }),
      });
    }
  }
};

class NflHandler {
  public access_token?: string;
  public refresh_token?: string;
  public expires_at?: number;
  public device_id?: string;
  public device_info?: string;
  public uid?: string;

  public initialize = async () => {
    if (!useNflPlus) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = getRandomUUID();
      this.save();
    }

    if (!this.expires_at || !this.access_token) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useNflPlus) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(30, 'minutes'))) {
      await this.extendToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useNflPlus) {
      return;
    }

    const {dmaCode, plans}: {dmaCode: string; plans: {plan: string; status: string}[]} = jwt_decode(this.access_token);

    const redZoneAccess = plans.findIndex(p => p.plan === 'NFL_PLUS_PREMIUM' && p.status === 'ACTIVE') > -1;

    if (!dmaCode) {
      console.log('DMA Code not found for NFL+. Not searching for events');
      return;
    }

    console.log('Looking for NFL+ events...');
    const events: INFLEvent[] = [];

    try {
      const endSchedule = moment().add(2, 'days');

      const url = ['https://', 'api.nfl.com', '/experience/v1/livestreams'].join('');

      const {data} = await axios.get<INFLRes>(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
        },
      });

      data.data.items.forEach(i => {
        if (
          i.contentType === 'GAME' &&
          moment(i.startTime).isBefore(endSchedule) &&
          i.dmaCodes.find(dc => dc === `${dmaCode}`) &&
          i.language.find(l => l === 'en')
        ) {
          events.push(i);
        } else if (
          i.callSign === 'NFLNRZ' &&
          i.title === 'NFL RedZone' &&
          moment(i.startTime).isBefore(endSchedule) &&
          redZoneAccess
        ) {
          events.push(i);
        } else if (i.callSign === 'NFLNETWORK' && moment(i.startTime).isBefore(endSchedule) && useLinear) {
          events.push(i);
        }
      });

      await parseAirings(events);
    } catch (e) {
      console.error(e);
      console.log('Could not parse NFL+ events');
    }
  };

  public getEventData = async (id: string): Promise<[string, IHeaders]> => {
    try {
      await this.extendToken();

      const url = ['https://', 'api.nfl.com/', 'play/v1/asset/', id].join('');

      const {data} = await axios.post(
        url,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
            authorization: `Bearer ${this.access_token}`,
          },
        },
      );

      return [data.accessUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private extendToken = async (uidSignature?: string, signatureTimestamp?: string): Promise<void> => {
    try {
      const url = ['https://', 'api.nfl.com', '/identity/v3/token/refresh'].join('');

      const {data} = await axios.post(
        url,
        {
          clientKey: CLIENT_KEY,
          clientSecret: CLIENT_SECRET,
          deviceId: this.device_id,
          deviceInfo: Buffer.from(JSON.stringify(DEVICE_INFO), 'utf-8').toString('base64'),
          networkType: 'wifi',
          refreshToken: this.refresh_token,
          uid: this.uid,
          ...(uidSignature && {
            signatureTimestamp,
            uidSignature,
          }),
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.access_token = data.accessToken;
      this.refresh_token = data.refreshToken;
      this.expires_at = data.expiresIn;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh token for NFL+');
    }
  };

  private getToken = async (): Promise<void> => {
    try {
      const url = ['https://', 'api.nfl.com', '/identity/v3/token'].join('');

      const {data} = await axios.post(
        url,
        {
          clientKey: CLIENT_KEY,
          clientSecret: CLIENT_SECRET,
          deviceId: this.device_id,
          deviceInfo: Buffer.from(JSON.stringify(DEVICE_INFO), 'utf-8').toString('base64'),
          networkType: 'wifi',
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.access_token = data.accessToken;
      this.refresh_token = data.refreshToken;

      if (this.uid) {
        this.expires_at = data.expiresIn;
        this.save();
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get token for NFL+');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      await this.getToken();

      const url = ['https://', 'api.nfl.com', '/utilities/v1/regcode'].join('');
      const {data} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          'Content-Type': 'application/json',
          'User-Agent': okHttpUserAgent,
        },
      });

      const code = data.regCode;

      const putUrl = ['https://', 'api.nfl.com', '/keystore/v1/mvpd/', code, '?ttl=600000'].join('');

      await axios.put(
        putUrl,
        {
          ctvDevice: 'AndroidTV',
          deviceId: '15942c3b-e487-4a95-bb9a-361ca08fd385',
          expiresIn: 600,
          nflAccount: true,
          nflToken: true,
          platform: 'ctv',
          regCode: code,
        },
        {
          headers: {
            Authorization: `Bearer ${this.access_token}`,
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      console.log('=== NFL+ Auth ===');
      console.log('Please open a browser window and go to: https://id.nfl.com/account/activate?platform=androidtv');
      console.log('Enter code: ', code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode(code);
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
      console.log('Could not start the authentication process for Fox Sports!');
    }
  };

  private authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = ['https://', 'api.nfl.com', '/keystore/v1/mvpd/', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          'User-Agent': okHttpUserAgent,
        },
      });

      if (!data || !data.uidSignature) {
        return false;
      }

      this.uid = data.uid;

      await this.extendToken(data.uidSignature, data.signatureTimestamp);
      return true;
    } catch (e) {
      return false;
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'nfl_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'nfl_tokens.json'))) {
      const {device_id, access_token, expires_at, refresh_token, uid} = fsExtra.readJSONSync(
        path.join(configPath, 'nfl_tokens.json'),
      );

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
      this.uid = uid;
    }
  };
}

export const nflHandler = new NflHandler();
