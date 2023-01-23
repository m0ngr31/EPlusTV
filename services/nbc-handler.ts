import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import _ from 'lodash';
import url from 'url';
import moment from 'moment';

import {androidNbcUserAgent, userAgent} from './user-agent';
import {configPath} from './init-directories';
import {useNbcSports} from './networks';
import {createAdobeAuthHeader, IAdobeAuth, isAdobeTokenValid, willAdobeTokenExpire} from './adobe-helpers';
import {getRandomHex} from './shared-helpers';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';

interface IAppConfig {
  channelChanger: {
    displayName: string;
    id: string;
    subNav: {
      displayName: string;
      id: string;
      feedUrl: string;
    }[];
  }[];
}

interface INbcEntry {
  _id: string;
  pid: string;
  eventId: string;
  title: string;
  info: string;
  length?: number;
  free?: number;
  channel: string;
  displayLogo: string;
  image: string;
  ottStreamUrl?: string;
  iosStreamUrl?: string;
  videoSources?: {
    ottStreamUrl?: string;
    iosStreamUrl?: string;
    drmType?: string;
    drmAssetId?: string;
  }[];
  sportName: string;
  eventtimeofdayend: string;
  start: string;
}

interface IAuthResources {
  [key: string]: boolean;
}

const ADOBE_KEY = ['Q', '0', 'C', 'A', 'F', 'e', '5', 'T', 'S', 'C', 'e', 'E', 'U', '8', '6', 't'].join('');

const ADOBE_PUBLIC_KEY = [
  'n',
  'T',
  'W',
  'q',
  'X',
  '1',
  '0',
  'Z',
  'j',
  '8',
  'H',
  '0',
  'q',
  '3',
  '4',
  'O',
  'H',
  'A',
  'm',
  'C',
  'v',
  'b',
  'R',
  'A',
  'B',
  'j',
  'p',
  'B',
  'k',
  '0',
  '6',
  'w',
].join('');

const parseUrl = (event: INbcEntry): string => {
  if (event.ottStreamUrl) {
    return event.ottStreamUrl;
  } else if (event.iosStreamUrl) {
    return event.iosStreamUrl;
  } else if (event.videoSources && event.videoSources[0]) {
    if (event.videoSources[0].ottStreamUrl) {
      return event.videoSources[0].ottStreamUrl;
    } else if (event.videoSources[0].iosStreamUrl) {
      return event.videoSources[0].iosStreamUrl;
    }
  }

  return;
};

const parseCategories = (event: INbcEntry) => {
  const categories = ['Sports', 'NBC Sports', event.sportName];

  return [...new Set(categories)];
};

const parseStart = (start: string): number => parseInt(moment.utc(start, 'YYYYMMDD-HHmm').format('x'), 10);
const parseEnd = (end: string): number => parseInt(moment.utc(end, 'YYYY-MM-DD HH:mm:ss').format('x'), 10);
const parseDuration = (event: INbcEntry): number =>
  moment(parseEnd(event.eventtimeofdayend)).diff(moment(parseStart(event.start)), 'seconds');

const parseAirings = async (events: INbcEntry[]) => {
  for (const event of events) {
    const entryExists = await db.entries.findOne<IEntry>({id: event.pid});

    if (!entryExists) {
      const start = parseStart(event.start);
      const end = parseEnd(event.eventtimeofdayend);

      const now = moment();
      const twoDays = moment().add(2, 'days');

      if (moment(start).isAfter(twoDays) || moment(end).isBefore(now)) {
        continue;
      }

      // Don't mess with DRM stuff for right now
      if (
        event.videoSources &&
        event.videoSources[0] &&
        (event.videoSources[0].drmType || event.videoSources[0].drmAssetId)
      ) {
        console.log(`${event.title} has DRM, so not scheduling`);
        continue;
      }

      console.log('Adding event: ', event.title);

      await db.entries.insert<IEntry>({
        categories: parseCategories(event),
        duration: parseDuration(event),
        end,
        from: 'nbcsports',
        id: event.pid,
        image: `http://hdliveextra-pmd.edgesuite.net/HD/image_sports/mobile/${event.image}_m50.jpg`,
        name: event.title,
        network: event.channel,
        start,
        url: parseUrl(event),
      });
    } else if (!entryExists.url || entryExists.url.length === 0) {
      // Don't mess with DRM stuff for right now
      if (
        event.videoSources &&
        event.videoSources[0] &&
        (event.videoSources[0].drmType || event.videoSources[0].drmAssetId)
      ) {
        continue;
      }

      const eventUrl = parseUrl(event);

      if (eventUrl) {
        console.log('Updating event: ', event.title);
        await db.entries.update<IEntry>({_id: entryExists._id}, {$set: {url: parseUrl(event)}});
      }
    }
  }
};

const RESOURCE_ID =
  '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>NBCOlympics</title><item><title>NBC Sports PGA Event</title><guid>123456789</guid><media:rating scheme="urn:vchip">TV-PG</media:rating></item></channel></rss>';

const NBC_APP_CONFIG = 'https://stream.nbcsports.com/data/mobile/apps/NBCSports/configuration-vjs.json';

const authorizedResources: IAuthResources = {};

class NbcHandler {
  public adobe_device_id?: string;
  public adobe_auth?: IAdobeAuth;

  private appConfig: IAppConfig;

  public initialize = async () => {
    if (!useNbcSports) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.adobe_device_id) {
      this.adobe_device_id = _.take(getRandomHex(), 16).join('');
      this.save();
    }

    if (!this.appConfig) {
      await this.getAppConfig();
    }

    if (!isAdobeTokenValid(this.adobe_auth)) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useNbcSports) {
      return;
    }

    if (willAdobeTokenExpire(this.adobe_auth)) {
      console.log('Refreshing TV Provider token (NBC Sports)');
      await this.refreshProviderToken();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useNbcSports) {
      return;
    }

    console.log('Looking for NBC Sports events...');

    try {
      const entries = await nbcHandler.getEvents();
      await parseAirings(entries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse NBC Sports events');
    }
  };

  public getEventData = async (event: IEntry): Promise<[string, IHeaders]> => {
    let url: string;
    let eventUrl = event.url;

    // Try and find the URL manually
    if (!eventUrl) {
      try {
        const events = await this.getEvents();
        const index = events.findIndex(e => e.pid === event.id);

        if (!index) {
          throw new Error('Could not get event url. Bailing');
        }

        eventUrl = parseUrl(events[index]);
      } catch (e) {
        console.log('Could not get event url. Bailing');
      }
    }

    try {
      await this.authorizeEvent(event.id);

      const mediaTokenUrl = [
        'https://',
        'api.auth.adobe.com',
        '/api/v1',
        '/mediatoken',
        '?requestor=nbcsports',
        `&deviceId=${this.adobe_device_id}`,
        `&resource=${encodeURIComponent(RESOURCE_ID)}`,
      ].join('');

      const {data} = await axios.get(mediaTokenUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', mediaTokenUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY, 'nbcsports'),
          'User-Agent': userAgent,
        },
      });

      const token = data.serializedToken;

      const tokenizedUrl = ['https://', 'tokens', '.', 'playmaker', 'services.com'].join('');

      const {data: urlData} = await axios.post(
        tokenizedUrl,
        {
          application: 'NBCSports',
          authInfo: {
            authenticationType: 'adobe-pass',
            requestorId: 'nbcsports',
            resourceId: Buffer.from(encodeURIComponent(RESOURCE_ID), 'utf-8').toString('base64'),
            token,
          },
          cdns: [
            {
              name: 'akamai',
              url: eventUrl,
            },
          ],
          pid: event.id,
          platform: 'android',
        },
        {
          headers: {
            Accept: '*/*',
            'Accept-Language': 'en;q=1',
            'Content-Type': 'application/json',
            'User-Agent': 'okhttp/3.12.12',
          },
        },
      );

      url = urlData.akamai[0].tokenizedUrl;
    } catch (e) {
      console.error(e);
      console.log('Could not get stream data. Event might be upcoming, ended, or in blackout...');
    }

    return [
      url,
      {
        'User-Agent': androidNbcUserAgent,
      },
    ];
  };

  private getEvents = async (): Promise<INbcEntry[]> => {
    let entries = [];

    try {
      for (const category of this.appConfig.channelChanger) {
        if (category.id === 'nbc-sports' || category.id === 'nbc-golf') {
          for (const subCategory of category.subNav) {
            if (subCategory.id === 'live-upcoming') {
              const {data} = await axios.get<{results: INbcEntry[]}>(
                subCategory.feedUrl.replace('[PLATFORM]', 'android'),
              );
              entries = [...entries, ...data.results];
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      console.log('Could not get schedule for NBC Sports');
    }

    return entries;
  };

  private authorizeEvent = async (eventId: string) => {
    if (authorizedResources[eventId]) {
      return;
    }

    const authorizeEventTokenUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1',
      '/authorize',
      '?requestor=nbcsports',
      `&deviceId=${this.adobe_device_id}`,
      `&resource=${encodeURIComponent(RESOURCE_ID)}`,
    ].join('');

    try {
      await axios.get(authorizeEventTokenUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', authorizeEventTokenUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY, 'nbcsports'),
          'User-Agent': userAgent,
        },
      });

      authorizedResources[eventId] = true;
    } catch (e) {
      console.error(e);
      console.log('Could not authorize event. Might be blacked out or not available from your TV provider');
    }
  };

  private getAppConfig = async () => {
    try {
      const {data} = await axios.get<IAppConfig>(NBC_APP_CONFIG);
      this.appConfig = data;
    } catch (e) {
      console.error(e);
      console.log('Could not load API app config');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    const regUrl = ['https://', 'api.auth.adobe.com', '/reggie/', 'v1/', 'nbcsports', '/regcode'].join('');

    try {
      const {data} = await axios.post(
        regUrl,
        new url.URLSearchParams({
          deviceId: this.adobe_device_id,
          deviceType: 'android_tv',
          ttl: '3600',
        }).toString(),
        {
          headers: {
            Authorization: createAdobeAuthHeader('POST', regUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY, 'nbcsports'),
            'User-Agent': userAgent,
          },
        },
      );

      console.log('== TV Provider Auth ==');
      console.log('Please open a browser window and go to: https://www.nbcsports.com/activate');
      console.log('Enter code: ', data.code);
      console.log('Select "Android TV"');
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
      console.log('Could not start the authentication process for NBC Sports!');
    }
  };

  private authenticateRegCode = async (regcode: string): Promise<boolean> => {
    const regUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1/',
      'authenticate/',
      regcode,
      '?requestor=nbcsports',
    ].join('');

    try {
      const {data} = await axios.get<IAdobeAuth>(regUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', regUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY, 'nbcsports'),
          'User-Agent': userAgent,
        },
      });

      this.adobe_auth = data;
      this.save();

      return true;
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error(e);
        console.log('Could not get provider token data for NBC Sports!');
      }

      return false;
    }
  };

  private refreshProviderToken = async (): Promise<void> => {
    if (!this.adobe_device_id) {
      await this.startProviderAuthFlow();
      return;
    }

    const renewUrl = [
      'https://',
      'api.auth.adobe.com',
      '/api/v1/',
      'tokens/authn',
      '?requestor=nbcsports',
      `&deviceId=${this.adobe_device_id}`,
    ].join('');

    try {
      const {data} = await axios.get<IAdobeAuth>(renewUrl, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', renewUrl, ADOBE_KEY, ADOBE_PUBLIC_KEY, 'nbcsports'),
          'User-Agent': userAgent,
        },
      });

      this.adobe_auth = data;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not refresh provider token data!');
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'nbc_tokens.json'), _.omit(this, 'appConfig'), {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'nbc_tokens.json'))) {
      const {adobe_device_id, adobe_auth} = fsExtra.readJSONSync(path.join(configPath, 'nbc_tokens.json'));

      this.adobe_device_id = adobe_device_id;
      this.adobe_auth = adobe_auth;
    }
  };
}

export const nbcHandler = new NbcHandler();
