import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import moment from 'moment';
import _ from 'lodash';
import crypto from 'crypto';

import {cbsSportsUserAgent, userAgent} from './user-agent';
import {configPath} from './config';
import {useCBSSports} from './networks';
import {IEntry, IHeaders} from './shared-interfaces';
import {db} from './database';
import {getRandomUUID} from './shared-helpers';
import {createAdobeAuthHeader} from './adobe-helpers';

interface ICBSEvent {
  id: number;
  video?: {
    sources?: {
      hls?: {
        url: string;
        urlNoAd: string;
      };
    };
    about: {
      duration: number;
      images: {
        baseImage2x3?: string;
        baseImage16X9: string;
        baseImage16X5?: string;
      };
      prefix: string;
      description: string;
      title: string;
      shortTitle: string;
    };
    network: string;
    schedule: {
      videoStartDate: number;
      videoEndDate: number;
    };
    ads: {
      dai?: {
        daiAssetKey?: string;
      };
    };
    analytics: {
      nielsonGenre: string;
    };
    properties: {
      type: string;
      sport: string;
      league?: string;
      leagueDisplayName?: string;
      tagSlugs?: string[];
      tags?: string[];
    };
    authentication: string[];
  };
}

interface IGameData {
  name: string;
  sport: string;
  image: string;
  categories: string[];
}

const API_KEY = [
  'l',
  'y',
  'R',
  '2',
  'U',
  '3',
  '7',
  'S',
  'i',
  'e',
  '8',
  '0',
  'c',
  '0',
  '2',
  'c',
  'J',
  'M',
  'p',
  'O',
  'H',
  '4',
  'C',
  '3',
  'g',
  'J',
  'e',
  't',
  'y',
  '4',
  'L',
  'O',
  '1',
  'W',
  'n',
  'L',
  'A',
  '1',
  'F',
  'O',
].join('');

const ADOBE_KEY = ['w', 'G', 'x', 'd', 'a', 'c', 'C', 'K', 'M', 'S', '8', 't', 'X', 'n', 'A', 'S'].join('');

const ADOBE_PUBLIC_KEY = [
  'G',
  'F',
  '6',
  'q',
  'D',
  '5',
  'q',
  'a',
  't',
  '3',
  'l',
  'L',
  'w',
  '9',
  'a',
  'y',
  '8',
  'I',
  'j',
  'g',
  '8',
  '0',
  'b',
  '3',
  'N',
  'P',
  'H',
  '7',
  'c',
  'F',
  'E',
  'G',
].join('');

const SYNCBAK_KEY = [
  '0',
  'e',
  'f',
  'b',
  'e',
  '7',
  '9',
  'd',
  '9',
  '6',
  'f',
  '2',
  '4',
  'f',
  '9',
  '2',
  '8',
  'd',
  '9',
  '1',
  'f',
  '5',
  'f',
  'd',
  '8',
  '9',
  '5',
  '5',
  'd',
  '1',
  '4',
  '3',
].join('');

const SYNCBAK_PUBLIC_KEY = [
  '1',
  'b',
  '3',
  'c',
  '7',
  '2',
  '7',
  'c',
  'a',
  '1',
  '1',
  '6',
  '4',
  'a',
  '1',
  '9',
  '8',
  '5',
  '1',
  'a',
  '1',
  '0',
  '2',
  'e',
  'a',
  '6',
  '5',
  '0',
  'e',
  '4',
  '9',
  'd',
].join('');

const CHANNEL_MAP = {
  CBSCHAMPIONSLEAGUE: 'ydKcHHYQSt27vbSP38xMVw',
  CBSSGOLAZO: '7f3Wv6f7QEKfQna22jHqLQ',
  CBSSHQ: '9Lq0ERvoSR-z9AwvFS-xYA',
} as const;

const getEventData = (event: ICBSEvent): IGameData => {
  const sport = event.video.properties.sport;
  const categories: string[] = [
    'CBS Sports',
    'CBS',
    sport,
    ...(event.video.properties.tagSlugs || []),
    event.video.properties.league,
    event.video.properties.leagueDisplayName,
  ];

  return {
    categories: [...new Set(categories)].filter(a => a),
    image:
      event.video.about.images.baseImage16X9 ||
      event.video.about.images.baseImage2x3 ||
      event.video.about.images.baseImage16X5,
    name: event.video.about.title,
    sport,
  };
};

const parseAirings = async (events: ICBSEvent[]) => {
  const now = moment();
  const endDate = moment().add(2, 'days').endOf('day');

  for (const event of events) {
    if (!event || !event.id) {
      return;
    }

    const gameData = getEventData(event);

    const entryExists = await db.entries.findOne<IEntry>({id: event.id});

    if (!entryExists) {
      const start = moment(event.video.schedule.videoStartDate * 1000);
      const end = moment(event.video.schedule.videoEndDate * 1000);

      if (end.isBefore(now) || start.isAfter(endDate)) {
        continue;
      }

      console.log('Adding event: ', gameData.name);

      await db.entries.insert<IEntry>({
        categories: gameData.categories,
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        feed: event.video.network,
        from: 'cbssports',
        id: `${event.id}`,
        image: gameData.image,
        name: gameData.name,
        network: 'CBS Sports',
        sport: gameData.sport,
        start: start.valueOf(),
        ...((event.video.sources.hls.urlNoAd || event.video.sources.hls.url) && {
          url: event.video.sources.hls.urlNoAd || event.video.sources.hls.url,
        }),
      });
    }
  }
};

class CBSHandler {
  public device_id?: string;
  public user_id?: string;
  public mvpd_id?: string;

  public initialize = async () => {
    if (!useCBSSports) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = getRandomUUID();
      this.save();
    }

    if (!this.user_id) {
      await this.startProviderAuthFlow();
    }
  };

  public refreshTokens = async () => {
    if (!useCBSSports) {
      return;
    }

    await this.adobeAuthN();
  };

  public getSchedule = async (): Promise<void> => {
    if (!useCBSSports) {
      return;
    }

    const dma = await this.getDMACode();

    console.log('Looking for CBS Sports events...');

    const entries: ICBSEvent[] = [];

    const now = moment().subtract(12, 'hours');
    const endSchedule = moment().add(2, 'days').endOf('day');

    try {
      const url = [
        'https://',
        'video-api.cbssports.com',
        '/vms/events/v5/',
        '?device=firetv',
        '&transform=ottv5',
        '&dma=',
        dma,
      ].join('');

      const {data} = await axios.get<ICBSEvent[]>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': cbsSportsUserAgent,
          'x-api-key': API_KEY,
        },
      });

      data.forEach(e => {
        if (
          (e.video.authentication.includes('adobe') || _.isEqual(e.video.authentication, [])) &&
          moment(e.video.schedule.videoStartDate * 1000).isBefore(endSchedule) &&
          // Some events have a crazy old start date
          moment(e.video.schedule.videoStartDate * 1000).isAfter(now) &&
          moment(e.video.schedule.videoEndDate * 1000).isAfter(now)
        ) {
          entries.push(e);
        }
      });
    } catch (e) {
      console.error(e);
      console.log('Could not parse CBS Sports events');
    }

    await parseAirings(entries);
  };

  public getEventData = async (eventId: string): Promise<[string, IHeaders]> => {
    const event = await db.entries.findOne<IEntry>({id: eventId});

    try {
      let streamUrl: string;

      if (event.url) {
        streamUrl = event.url;
      }

      // CBSSN || CBSE
      if (!CHANNEL_MAP[event.feed]) {
        const dma = await this.getDMACode();
        const token = this.generateTimedToken();

        const url = [
          'https://',
          'www.cbssports.com',
          '/api/content',
          '/video/syncbak/get-secure-url',
          '/1b3c727ca1164a19851a102ea650e49d/',
          token,
          '/CBS_SPORTS_NETWORK/',
          this.mvpd_id,
          '/8/',
          dma,
          '/?as=json&version=4',
        ].join('');

        const {data} = await axios.get(url, {
          headers: {
            'User-Agent': cbsSportsUserAgent,
          },
        });

        streamUrl = data.SUCCESS;
      } else if (!streamUrl) {
        const url = ['https://', 'pubads.g.doubleclick.net', '/ssai/event/', CHANNEL_MAP[event.feed], '/streams'].join(
          '',
        );

        const {data} = await axios.post(
          url,
          {},
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': userAgent,
            },
          },
        );

        streamUrl = data.stream_manifest;
      }

      return [streamUrl, {}];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private generateTimedToken = (): string =>
    crypto
      .createHmac('sha1', SYNCBAK_KEY)
      .update(`${Math.floor(Date.now() / 1000)}${SYNCBAK_PUBLIC_KEY}`)
      .digest('hex');

  private getDMACode = async (): Promise<string> => {
    try {
      const url = ['https://', 'video-api-geo.cbssports.com/'].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': cbsSportsUserAgent,
          'x-api-key': API_KEY,
        },
      });

      return data.dmaId;
    } catch (e) {
      console.error(e);
      console.log('Could not get DMA Code for CBS Sports');
    }
  };

  private startProviderAuthFlow = async (): Promise<void> => {
    try {
      const url = [
        'https://',
        'video-api.cbssports.com',
        '/vms',
        '/shortcode',
        '/v1',
        '?deviceId=',
        this.device_id,
        '&deviceType=firetv',
        '&authTypes=adobe',
        '&currentSubscriptions=',
      ].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': cbsSportsUserAgent,
          'x-api-key': API_KEY,
        },
      });

      console.log(`=== CBS Sports Auth ===`);
      console.log('Please open a browser window and go to: https://www.cbssports.com/firetv/');
      console.log('Enter code: ', data.code);
      console.log('App will continue when login has completed...');

      return new Promise(async (resolve, reject) => {
        // Reg code expires in 5 minutes
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
      console.log('Could not login to CBS Sports');
    }
  };

  private authenticateRegCode = async (code: string): Promise<boolean> => {
    try {
      const url = ['https://', 'video-api.cbssports.com', '/vms/shortcode/v1', '/status?shortcode=', code].join('');

      const {data} = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': cbsSportsUserAgent,
          'x-api-key': API_KEY,
        },
      });

      if (!data || data?.subscriptions.adobe !== 'y') {
        return false;
      }

      await this.adobeAuthN();

      return true;
    } catch (e) {
      return false;
    }
  };

  private adobeAuthN = async (): Promise<void> => {
    try {
      const url = [
        'https://',
        'api.auth.adobe.com',
        '/api/v1/tokens/authn',
        '?requestor=CBS_SPORTS',
        '&deviceId=',
        this.device_id,
        '&deviceType=firetv',
      ].join('');

      const {data} = await axios.get(url, {
        headers: {
          Authorization: createAdobeAuthHeader('GET', '/authn', ADOBE_KEY, ADOBE_PUBLIC_KEY, 'CBS_SPORTS'),
          'Content-Type': 'application/json',
          'User-Agent': cbsSportsUserAgent,
        },
      });

      this.user_id = data.userId;
      this.mvpd_id = data.mvpd;

      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not lauthenticate with Adobe');
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'cbs_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'cbs_tokens.json'))) {
      const {device_id, user_id, mvpd_id} = fsExtra.readJSONSync(path.join(configPath, 'cbs_tokens.json'));

      this.device_id = device_id;
      this.user_id = user_id;
      this.mvpd_id = mvpd_id;
    }
  };
}

export const cbsHandler = new CBSHandler();
