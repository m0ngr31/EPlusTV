import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import jwt_decode from 'jwt-decode';

import {okHttpUserAgent} from './user-agent';
import {configPath} from './config';
import {useNfl} from './networks';
import {ClassTypeWithoutMethods, IEntry, IHeaders, IProvider} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';
import {useLinear} from './channels';
import {debug} from './debug';

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

const nflConfigPath = path.join(configPath, 'nfl_tokens.json');

export type TOtherAuth = 'prime' | 'tve' | 'peacock' | 'sunday_ticket';

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
    const setup = (await db.providers.count({name: 'nfl'})) > 0 ? true : false;

    if (!setup) {
      const data: TNFLTokens = {};

      if (useNfl.plus) {
        this.loadJSON();

        data.device_id = this.device_id;
        data.access_token = this.access_token;
        data.expires_at = this.expires_at;
        data.refresh_token = this.refresh_token;
        data.tv_access_token = this.tv_access_token;
        data.tv_expires_at = this.tv_expires_at;
        data.tv_refresh_token = this.tv_refresh_token;
        data.uid = this.uid;
        data.mvpdIdp = this.mvpdIdp;
        data.mvpdUserId = this.mvpdUserId;
        data.mvpdUUID = this.mvpdUUID;
        data.amazonPrimeUUID = this.amazonPrimeUUID;
        data.amazonPrimeUserId = this.amazonPrimeUserId;
        data.peacockUserId = this.peacockUserId;
        data.peacockUUID = this.peacockUUID;
        data.youTubeUUID = this.youTubeUUID;
        data.youTubeUserId = this.youTubeUserId;
      }

      await db.providers.insert<IProvider<TNFLTokens>>({
        enabled: useNfl.plus,
        linear_channels: [
          {
            enabled: useNfl.network,
            id: 'NFLNETWORK',
            name: 'NFL Network',
            tmsId: '45399',
          },
          {
            enabled: useNfl.redZone,
            id: 'NFLNRZ',
            name: 'NFL RedZone',
            tmsId: '65025',
          },
          {
            enabled: useNfl.channel,
            id: 'NFLDIGITAL1_OO_v3',
            name: 'NFL Channel',
            tmsId: '121705',
          },
        ],
        name: 'nfl',
        tokens: data,
      });

      if (fs.existsSync(nflConfigPath)) {
        fs.rmSync(nflConfigPath);
      }
    }

    if (useNfl.plus) {
      console.log('Using NFLPLUS variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.network) {
      console.log('Using NFLNETWORK variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.channel) {
      console.log('Using NFLCHANNEL variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.tve) {
      console.log('Using NFL_TVE variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.peacock) {
      console.log('Using NFL_PEACOCK variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.prime) {
      console.log('Using NFL_PRIME variable is no longer needed. Please use the UI going forward');
    }
    if (useNfl.sundayTicket) {
      console.log('Using NFL_SUNDAY_TICKET variable is no longer needed. Please use the UI going forward');
    }

    const {enabled} = await db.providers.findOne<IProvider>({name: 'nfl'});

    if (!enabled) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    await this.load();
  };

  public refreshTokens = async () => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'nfl'});

    if (!enabled) {
      return;
    }

    if (!this.expires_at || moment(this.expires_at * 1000).isBefore(moment())) {
      await this.extendTokens();
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOne<IProvider>({name: 'nfl'});

    if (!enabled) {
      return;
    }

    const {dmaCode}: INFLJwt = jwt_decode(this.access_token);

    const redZoneAccess = await this.checkRedZoneAccess();
    const nflNetworkAccess = await this.checkNetworkAccess();
    const nflChannelAccess = await this.checkChannelAccess();
    const hasPlus = this.checkPlusAccess();

    if (!dmaCode) {
      console.log('DMA Code not found for NFL+. Not searching for events');
      return;
    }

    console.log('Looking for NFL events...');
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

      debug.saveRequestData(data, 'nfl', 'epg');

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

      if (nflChannelAccess && useLinear) {
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
      console.log('Could not parse NFL events');
    }
  };

  public getEventData = async (id: string): Promise<[string, IHeaders]> => {
    try {
      await this.refreshTokens();

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

  private updateChannelAccess = async (index: number, enabled: boolean): Promise<void> => {
    const {linear_channels} = await db.providers.findOne<IProvider<TNFLTokens>>({name: 'nfl'});

    const updatedChannels = linear_channels.map((c, i) => {
      if (i !== index) {
        return c;
      }

      c.enabled = enabled;
      return c;
    });

    await db.providers.update({name: 'nfl'}, {$set: {linear_channels: updatedChannels}});
  };

  private checkRedZoneAccess = async (): Promise<boolean> => {
    try {
      const {plans, networks}: INFLJwt = jwt_decode(this.access_token);

      if (plans) {
        const redZoneAccess =
          plans.findIndex(p => p.plan === 'NFL_PLUS_PREMIUM' && p.status === 'ACTIVE') > -1 || networks?.NFLRZ
            ? true
            : false;

        await this.updateChannelAccess(1, redZoneAccess);

        return redZoneAccess;
      }
    } catch (e) {
      await this.updateChannelAccess(1, false);
    }

    return false;
  };

  private checkNetworkAccess = async (): Promise<boolean> => {
    try {
      const {plans, networks}: INFLJwt = jwt_decode(this.tv_access_token);

      if (plans) {
        const networkAccess = (this.checkPlusAccess() || networks?.NFLN) && useLinear ? true : false;
        await this.updateChannelAccess(0, networkAccess);

        return networkAccess;
      }
    } catch (e) {
      await this.updateChannelAccess(0, false);
    }

    return false;
  };

  private checkChannelAccess = async (): Promise<boolean> => {
    try {
      const {linear_channels} = await db.providers.findOne<IProvider<TNFLTokens>>({name: 'nfl'});

      return linear_channels[2].enabled;
    } catch (e) {}

    return false;
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

  private checkTVEAccess = (): boolean => (this.mvpdIdp ? true : false);
  private checkPeacockAccess = (): boolean => (this.peacockUserId ? true : false);
  private checkPrimeAccess = (): boolean => (this.amazonPrimeUserId ? true : false);
  private checkSundayTicket = (): boolean => (this.youTubeUserId ? true : false);

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

      await this.save();

      await this.checkRedZoneAccess();
      await this.checkNetworkAccess();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh token for NFL');
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
          refreshToken: this.tv_refresh_token,
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

      if (data.additionalInfo) {
        data.additionalInfo.forEach(ai => {
          if (ai.data) {
            if (ai.data.idp === 'amazon') {
              this.amazonPrimeUUID = ai.data.newUUID;
            }
          }
        });
      }

      await this.save();

      await this.checkRedZoneAccess();
      await this.checkNetworkAccess();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh token for NFL');
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
        await this.save();
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get token for NFL');
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
        await this.save();
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get TV token for NFL');
    }
  };

  public getAuthCode = async (otherAuth?: TOtherAuth): Promise<[string, string?]> => {
    // Reset state
    if (!otherAuth) {
      this.device_id = getRandomUUID();
      this.access_token = undefined;
      this.expires_at = undefined;
      this.refresh_token = undefined;
      this.tv_access_token = undefined;
      this.tv_expires_at = undefined;
      this.tv_refresh_token = undefined;
      this.uid = undefined;
      this.mvpdIdp = undefined;
      this.mvpdUserId = undefined;
      this.mvpdUUID = undefined;
      this.amazonPrimeUUID = undefined;
      this.amazonPrimeUserId = undefined;
      this.peacockUserId = undefined;
      this.peacockUUID = undefined;
      this.youTubeUUID = undefined;
      this.youTubeUserId = undefined;
    }

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

      return [code, otherAuth];
    } catch (e) {
      console.error(e);
      console.log('Could not start the authentication process for Fox Sports!');
    }
  };

  public authenticateRegCode = async (code: string, otherAuth?: TOtherAuth): Promise<boolean> => {
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

        await this.save();

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

  private save = async (): Promise<void> => {
    await db.providers.update({name: 'nfl'}, {$set: {tokens: this}});
  };

  private load = async (): Promise<void> => {
    const {tokens} = await db.providers.findOne<IProvider<TNFLTokens>>({name: 'nfl'});
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
    } = tokens;

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
  };

  private loadJSON = () => {
    if (fs.existsSync(nflConfigPath)) {
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
      } = fsExtra.readJSONSync(nflConfigPath);

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

export type TNFLTokens = ClassTypeWithoutMethods<NflHandler>;

export const nflHandler = new NflHandler();
