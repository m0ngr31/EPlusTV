import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useNfl} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';
import {useLinear} from './channels';

interface INFLRes {
  data: {
    items: INFLEvent[];
  };
}

interface INFLChannelRes {
  items: INFLEvent[];
}

interface INFLEvent {
  authorizations: {
    [key: string]: any;
  };
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
  networks: string[];
  broadcastAiringType?: string;
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

const TV_CLIENT_KEY = [
  'A',
  '3',
  'b',
  '7',
  '4',
  'w',
  'O',
  'i',
  'S',
  'D',
  'M',
  'r',
  'h',
  'J',
  'K',
  'e',
  'X',
  'A',
  'E',
  'I',
  'q',
  'g',
  'R',
  'I',
  'C',
  'B',
  'i',
  'B',
  'N',
  'o',
  '7',
  'o',
].join('');

const CLIENT_SECRET = ['q', 'G', 'h', 'E', 'v', '1', 'R', 't', 'I', '2', 'S', 'f', 'R', 'Q', 'O', 'e'].join('');

const TV_CLIENT_SECRET = ['u', 'o', 'C', 'y', 'y', 'k', 'y', 'U', 'w', 'D', 'b', 'f', 'Q', 'Z', 'r', '2'].join('');

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

const TV_DEVICE_INFO = {
  capabilities: {},
  ctvDevice: 'AndroidTV',
  diskCapacity: 6964142080,
  displayHeight: 2160,
  displayWidth: 3840,
  idfv: 'unknown',
  isLocationEnabled: true,
  manufacturer: 'onn',
  memory: 2063581184,
  model: 'onn. 4K Streaming Box',
  networkType: 'wifi',
  osName: 'Android',
  osVersion: '12',
  vendor: 'onn',
  version: 'goldfish',
  versionName: '18.0.65.101385778',
};

const DEFAULT_CATEGORIES = ['NFL', 'NFL+', 'Football'];

type TOtherAuth = 'prime' | 'tve' | 'peacock' | 'sunday_ticket';

interface INFLJwt {
  dmaCode: string;
  plans: {plan: string; status: string}[];
  networks?: {[key: string]: string};
}

const parseAirings = async (events: INFLEvent[]) => {
  const now = moment();
  const endDate = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.externalId});

    if (!entryExists) {
      const start = moment(event.startTime);
      const end = moment(start).add(event.duration, 'seconds');

      const isLinear =
        useLinear &&
        (event.callSign === 'NFLNETWORK' || event.callSign === 'NFLNRZ' || event.callSign === 'NFLDIGITAL1_OO_v3');

      if (!isLinear) {
        end.add(1, 'hour');
      }

      if (end.isBefore(now) || start.isAfter(endDate)) {
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
        feed: event.networks?.[0],
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
          replay: event.callSign === 'NFLDIGITAL1_OO_v3' || event.broadcastAiringType === 'REAIR',
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
  public tv_access_token?: string;
  public tv_refresh_token?: string;
  public tv_expires_at?: number;

  // Supplemental Auth
  public mvpdIdp?: string;
  public mvpdUserId?: string;
  public mvpdUUID?: string;
  public amazonPrimeUserId?: string;
  public amazonPrimeUUID?: string;
  public peacockUserId?: string;
  public peacockUUID?: string;
  public youTubeUserId?: string;
  public youTubeUUID?: string;

  public initialize = async () => {
    if (!useNfl.plus) {
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

    if (useNfl.tve && (!this.mvpdIdp || !this.mvpdUserId || !this.mvpdUUID)) {
      await this.startProviderAuthFlow('tve');
    }

    if (useNfl.peacock && (!this.peacockUserId || !this.peacockUUID)) {
      await this.startProviderAuthFlow('peacock');
    }

    if (useNfl.prime && (!this.amazonPrimeUserId || !this.amazonPrimeUUID)) {
      await this.startProviderAuthFlow('prime');
    }

    if (useNfl.sundayTicket && (!this.youTubeUserId || !this.youTubeUUID)) {
      await this.startProviderAuthFlow('sunday_ticket');
    }
  };

  public refreshTokens = async () => {
    if (!useNfl.plus) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at).isBefore(moment().add(30, 'minutes'))) {
      await this.extendTokens();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useNfl.plus) {
      return;
    }

    const {dmaCode}: INFLJwt = jwt_decode(this.access_token);

    const redZoneAccess = this.checkRedZoneAccess();
    const nflNetworkAccess = this.checkNetworkAccess();
    const hasPlus = this.checkPlusAccess();

    if (!dmaCode) {
      console.log('DMA Code not found for NFL+. Not searching for events');
      return;
    }

    console.log('Looking for NFL+ events...');
    const events: INFLEvent[] = [];

    try {
      const now = moment().subtract(12, 'hours');
      const endSchedule = moment().add(2, 'days').endOf('day');

      const url = ['https://', 'api.nfl.com', '/experience/v1/livestreams'].join('');

      const {data} = await axios.get<INFLRes>(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
        },
      });

      data.data.items.forEach(i => {
        if (moment(i.startTime).isBefore(endSchedule)) {
          if (
            i.contentType === 'GAME' &&
            i.dmaCodes.find(dc => dc === `${dmaCode}`) &&
            i.language.find(l => l === 'en')
          ) {
            if (
              // If you have NFL+, you get the game
              hasPlus ||
              // TVE
              this.checkTVEEventAccess(i) ||
              // Peacock
              (i.authorizations.peacock && this.checkPeacockAccess()) ||
              // Prime
              (i.authorizations.amazon_prime && this.checkPrimeAccess())
            ) {
              events.push(i);
            }
          } else if (
            i.callSign === 'NFLNRZ' &&
            i.title === 'NFL RedZone' &&
            // NFL+ Premium or TVE supports RedZone
            redZoneAccess
          ) {
            events.push(i);
          } else if (i.callSign === 'NFLNETWORK' && nflNetworkAccess && i.contentType !== 'AUDIO') {
            events.push(i);
          } else if (
            // Sunday Ticket
            i.contentType === 'GAME' &&
            i.language.find(l => l === 'en') &&
            i.authorizations.sunday_ticket &&
            this.checkSundayTicket()
          ) {
            events.push(i);
          }
        }
      });

      if (useNfl.channel && useLinear) {
        const url = [
          'https://',
          'api.nfl.com',
          '/live/v1/nflchannel',
          '?starttime=',
          now.toISOString(),
          '&endtime=',
          endSchedule.toISOString(),
        ].join('');

        const {data: nflChannelData} = await axios.get<INFLChannelRes>(url, {
          headers: {
            Authorization: `Bearer ${this.access_token}`,
          },
        });

        nflChannelData.items.forEach(i => events.push(i));
      }

      await parseAirings(events);
    } catch (e) {
      console.error(e);
      console.log('Could not parse NFL+ events');
    }
  };

  public getEventData = async (id: string): Promise<[string, IHeaders]> => {
    try {
      await this.extendTokens();

      const event = await db.entries.findOne<IEntry>({id});

      const isGame =
        event.channel !== 'NFLNETWORK' && event.channel !== 'NFLDIGITAL1_OO_v3' && event.channel !== 'NFLNRZ';

      const url = ['https://', 'api.nfl.com/', 'play/v1/asset/', id].join('');

      const {data} = await axios.post(
        url,
        {
          ...(this.checkTVEAccess() && {
            idp: this.mvpdIdp,
            mvpdUUID: this.mvpdUUID,
            mvpdUserId: this.mvpdUserId,
            networks: event.feed || 'NFLN',
          }),
          ...(this.checkPrimeAccess() && {
            amazonPrimeUUID: this.amazonPrimeUUID,
            amazonPrimeUserId: this.amazonPrimeUserId,
          }),
          ...(this.checkPeacockAccess() && {
            peacockUUID: this.amazonPrimeUUID,
            peacockUserId: this.amazonPrimeUserId,
          }),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
            authorization: `Bearer ${isGame ? this.access_token : this.tv_access_token}`,
          },
        },
      );

      return [data.accessUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private checkRedZoneAccess = (): boolean => {
    try {
      const {plans, networks}: INFLJwt = jwt_decode(this.access_token);

      if (plans) {
        useNfl.redZone =
          plans.findIndex(p => p.plan === 'NFL_PLUS_PREMIUM' && p.status === 'ACTIVE') > -1 || networks?.NFLRZ
            ? true
            : false;
      }
    } catch (e) {}

    return useNfl.redZone;
  };

  private checkNetworkAccess = (): boolean => {
    try {
      const {plans, networks}: INFLJwt = jwt_decode(this.access_token);

      if (plans) {
        const hasPlus = (this.checkPlusAccess() || networks?.NFLN) && useLinear ? true : false;
        useNfl.network = hasPlus;
      }
    } catch (e) {}

    return useNfl.network;
  };

  private checkPlusAccess = (): boolean => {
    let hasPlus = false;

    try {
      const {plans}: INFLJwt = jwt_decode(this.access_token);

      if (plans) {
        hasPlus =
          plans.findIndex(p => (p.plan === 'NFL_PLUS' || p.plan === 'NFL_PLUS_PREMIUM') && p.status === 'ACTIVE') > -1
            ? true
            : false;
      }
    } catch (e) {}

    return hasPlus;
  };

  private checkTVEAccess = (): boolean => (this.mvpdIdp && useNfl.tve ? true : false);
  private checkPeacockAccess = (): boolean => (this.peacockUserId && useNfl.peacock ? true : false);
  private checkPrimeAccess = (): boolean => (this.amazonPrimeUserId && useNfl.prime ? true : false);
  private checkSundayTicket = (): boolean => (this.youTubeUserId && useNfl.sundayTicket ? true : false);

  private checkTVEEventAccess = (event: INFLEvent): boolean => {
    let hasChannel = false;

    try {
      const {networks}: INFLJwt = jwt_decode(this.access_token);

      event.networks.forEach(n => {
        if (networks[n]) {
          hasChannel = true;
        }
      });
    } catch (e) {}

    return hasChannel;
  };

  private extendTokens = async (): Promise<void> => {
    await this.extendToken();
    await this.extendTvToken();
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
          ...(this.mvpdIdp && {
            mvpdIdp: this.mvpdIdp,
            mvpdUUID: this.mvpdUUID,
            mvpdUserId: this.mvpdUserId,
          }),
          ...(this.amazonPrimeUserId && {
            amazonPrimeUUID: this.amazonPrimeUUID,
            amazonPrimeUserId: this.amazonPrimeUserId,
          }),
          ...(this.peacockUserId && {
            peacockUUID: this.peacockUUID,
            peacockUserId: this.peacockUserId,
          }),
          ...(this.youTubeUserId && {
            youTubeUUID: this.youTubeUUID,
            youTubeUserId: this.youTubeUserId,
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

      if (data.additionalInfo) {
        data.additionalInfo.forEach(ai => {
          if (ai.data) {
            if (ai.data.idp === 'amazon') {
              this.amazonPrimeUUID = ai.data.newUUID;
            }
          }
        });
      }

      this.save();

      this.checkRedZoneAccess();
      this.checkNetworkAccess();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh token for NFL+');
    }
  };

  private extendTvToken = async (uidSignature?: string, signatureTimestamp?: string): Promise<void> => {
    try {
      const url = ['https://', 'api.nfl.com', '/identity/v3/token/refresh'].join('');

      const {data} = await axios.post(
        url,
        {
          clientKey: TV_CLIENT_KEY,
          clientSecret: TV_CLIENT_SECRET,
          deviceId: this.device_id,
          deviceInfo: Buffer.from(JSON.stringify(TV_DEVICE_INFO), 'utf-8').toString('base64'),
          networkType: 'wifi',
          refreshToken: this.refresh_token,
          uid: this.uid,
          ...(uidSignature && {
            signatureTimestamp,
            uidSignature,
          }),
          ...(this.mvpdIdp && {
            mvpdIdp: this.mvpdIdp,
            mvpdUUID: this.mvpdUUID,
            mvpdUserId: this.mvpdUserId,
          }),
          ...(this.amazonPrimeUserId && {
            amazonPrimeUUID: this.amazonPrimeUUID,
            amazonPrimeUserId: this.amazonPrimeUserId,
          }),
          ...(this.peacockUserId && {
            peacockUUID: this.peacockUUID,
            peacockUserId: this.peacockUserId,
          }),
          ...(this.youTubeUserId && {
            youTubeUUID: this.youTubeUUID,
            youTubeUserId: this.youTubeUserId,
          }),
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.tv_access_token = data.accessToken;
      this.tv_refresh_token = data.refreshToken;
      this.tv_expires_at = data.expiresIn;
      this.save();

      if (data.additionalInfo) {
        data.additionalInfo.forEach(ai => {
          if (ai.data) {
            if (ai.data.idp === 'amazon') {
              this.amazonPrimeUUID = ai.data.newUUID;
            }
          }
        });
      }

      this.checkRedZoneAccess();
      this.checkNetworkAccess();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh token for NFL+');
    }
  };

  private getTokens = async (): Promise<void> => {
    await this.getToken();
    await this.getTvToken();
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

  private getTvToken = async (): Promise<void> => {
    try {
      const url = ['https://', 'api.nfl.com', '/identity/v3/token'].join('');

      const {data} = await axios.post(
        url,
        {
          clientKey: TV_CLIENT_KEY,
          clientSecret: TV_CLIENT_SECRET,
          deviceId: this.device_id,
          deviceInfo: Buffer.from(JSON.stringify(TV_DEVICE_INFO), 'utf-8').toString('base64'),
          networkType: 'wifi',
        },
        {
          headers: {
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      this.tv_access_token = data.accessToken;
      this.tv_refresh_token = data.refreshToken;

      if (this.uid) {
        this.tv_expires_at = data.expiresIn;
        this.save();
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get TV token for NFL+');
    }
  };

  private startProviderAuthFlow = async (otherAuth?: TOtherAuth): Promise<void> => {
    try {
      await this.getTokens();

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
          deviceId: this.device_id,
          expiresIn: 600,
          platform: 'ctv',
          regCode: code,
          ...(!otherAuth && {
            nflAccount: true,
            nflToken: true,
          }),
          ...(otherAuth === 'tve' && {
            idp: 'TV_PROVIDER',
            nflAccount: false,
          }),
          ...(otherAuth === 'prime' && {
            idp: 'AMAZON',
            nflAccount: false,
          }),
          ...(otherAuth === 'peacock' && {
            idp: 'PEACOCK',
            nflAccount: false,
          }),
          ...(otherAuth === 'sunday_ticket' && {
            idp: 'YOUTUBE',
            nflAccount: false,
          }),
        },
        {
          headers: {
            Authorization: `Bearer ${this.access_token}`,
            'Content-Type': 'application/json',
            'User-Agent': okHttpUserAgent,
          },
        },
      );

      const otherAuthName =
        otherAuth === 'tve'
          ? '(TV Provider) '
          : otherAuth === 'prime'
          ? '(Amazon Prime) '
          : otherAuth === 'peacock'
          ? '(Peacock) '
          : otherAuth === 'sunday_ticket'
          ? '(Youtube) '
          : '';

      console.log(`=== NFL+ Auth ${otherAuthName}===`);
      console.log(`Please open a browser window and go to: https://id.nfl.com/account/activate?regCode=${code}`);
      console.log('Enter code: ', code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
        const maxNumOfReqs = 30;

        let numOfReqs = 0;

        const authenticate = async () => {
          if (numOfReqs < maxNumOfReqs) {
            const res = await this.authenticateRegCode(code, otherAuth);
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

  private authenticateRegCode = async (code: string, otherAuth?: TOtherAuth): Promise<boolean> => {
    try {
      const url = ['https://', 'api.nfl.com', '/keystore/v1/mvpd/', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.access_token}`,
          'User-Agent': okHttpUserAgent,
        },
      });

      if (!data) {
        return false;
      }

      if (otherAuth) {
        if (!data.userId) {
          return false;
        }

        if (otherAuth === 'tve') {
          this.mvpdIdp = data.idp;
          this.mvpdUserId = data.userId;
          this.mvpdUUID = data.uuid;
        } else if (otherAuth === 'prime') {
          this.amazonPrimeUserId = data.userId;
          this.amazonPrimeUUID = data.uuid;
        } else if (otherAuth === 'peacock') {
          this.peacockUserId = data.userId;
          this.peacockUUID = data.uuid;
        } else if (otherAuth === 'sunday_ticket') {
          this.youTubeUserId = data.userId;
          this.youTubeUUID = data.uuid;
        }

        this.save();

        await this.extendToken();
        await this.extendTvToken();
      } else {
        if (!data.uidSignature) {
          return false;
        }

        this.uid = data.uid;

        await this.extendToken(data.uidSignature, data.signatureTimestamp);
        await this.extendTvToken(data.uidSignature, data.signatureTimestamp);
      }

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
      const {
        device_id,
        access_token,
        expires_at,
        refresh_token,
        uid,
        tv_access_token,
        tv_expires_at,
        tv_refresh_token,
        mvpdIdp,
        mvpdUserId,
        mvpdUUID,
        amazonPrimeUserId,
        amazonPrimeUUID,
        peacockUserId,
        peacockUUID,
        youTubeUserId,
        youTubeUUID,
      } = fsExtra.readJSONSync(path.join(configPath, 'nfl_tokens.json'));

      this.device_id = device_id;
      this.access_token = access_token;
      this.expires_at = expires_at;
      this.refresh_token = refresh_token;
      this.tv_access_token = tv_access_token;
      this.tv_expires_at = tv_expires_at;
      this.tv_refresh_token = tv_refresh_token;
      this.uid = uid;

      // Supplemental Auth
      this.mvpdIdp = mvpdIdp;
      this.mvpdUserId = mvpdUserId;
      this.mvpdUUID = mvpdUUID;
      this.amazonPrimeUUID = amazonPrimeUUID;
      this.amazonPrimeUserId = amazonPrimeUserId;
      this.peacockUserId = peacockUserId;
      this.peacockUUID = peacockUUID;
      this.youTubeUUID = youTubeUUID;
      this.youTubeUserId = youTubeUserId;
    }
  };
}

export const nflHandler = new NflHandler();
