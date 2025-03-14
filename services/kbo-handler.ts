import moment, {Moment} from 'moment-timezone';
import * as cheerio from 'cheerio';

import {userAgent} from './user-agent';
import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {combineImages, normalTimeRange} from './shared-helpers';
import axios from 'axios';

const SOOP_CATEGORY_ID = '90';

interface IKBOEvent {
  awayLogo: string;
  homeLogo: string;
  title: string;
  start: Date;
  id: string;
}

interface IKBOMeta {
  client_id: string;
}

const parseAirings = async (events: IKBOEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: event.id});

    if (!entryExists) {
      const start = moment(event.start);
      const end = moment(event.start).add(6, 'hours');
      const originalEnd = moment(event.start).add(3.5, 'hours');

      if (end.isBefore(now) || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      const image = await combineImages(event.awayLogo, event.homeLogo);

      await db.entries.insertAsync<IEntry>({
        categories: [...new Set(['KBO', 'Baseball'])],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'kbo',
        id: event.id,
        image,
        name: event.title,
        network: 'SOOP Live',
        originalEnd: originalEnd.valueOf(),
        sport: 'KBO',
        start: start.valueOf(),
      });
    }
  }
};

class KBOHandler {
  public client_id?: string;

  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'kbo'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      await db.providers.insertAsync<IProvider>({
        enabled: false,
        meta: {
          client_id: '',
        },
        name: 'kbo',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'kbo'});

    if (!enabled) {
      return;
    }

    const {meta} = await db.providers.findOneAsync<IProvider<any, IKBOMeta>>({name: 'kbo'});

    this.client_id = meta.client_id;
  };

  public getClientId = async (): Promise<void> => {
    try {
      const res = await axios.get([
        'https://',
        'www.sooplive.com',
        '/category/',
        'kbo-league'].join(''),
        {
          headers: {
            'user-agent': userAgent,
          },
        },
      );

      if ( res.headers['set-cookie'] ) {
        const cookies = res.headers['set-cookie'];
        const cookie_name = 'client-id';
        for (var i = 0; i < cookies.length; i++) {
          if (cookies[i].startsWith(cookie_name+'=')) {
            this.client_id = cookies[i].split(';')[0].slice(cookie_name.length + 1);
            break;
          }
        }
      }

      if (this.client_id != '') {
        await db.providers.updateAsync({name: 'kbo'}, {$set: {'meta.client_id': this.client_id}});
      } else {
        console.log('Did not get client ID');
      }
    } catch (e) {
      console.log('Could not get client ID');
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'kbo'});

    if (!enabled) {
      return;
    }

    console.log('Looking for KBO events...');

    const allItems: IKBOEvent[] = [];

    const today = new Date();
    // schedule is fetched as a 3-day window centered around tomorrow, Korea time
    const startDate = moment.tz(today, 'Asia/Seoul').add(1, 'days').format('YYYYMMDD');

    try {
      const {data} = await axios.post(['http://', 'eng.koreabaseball.com', '/Schedule/', 'MainSchedule.aspx'].join(''),
        {
          gameDate: startDate,
          flag: 'NEXT',
        },
        {
          headers: {
            'user-agent': userAgent,
            'content-type': 'application/x-www-form-urlencoded',
          },
        }
      );
      const $ = cheerio.load(data);

      for (var i = 1; i <= 3; i++) {
        const dateString = $(`#schedule${i}`).find('h4').eq(0).text();
        const scheduleItems = $(`#schedule${i}`)
          .find('li');

        scheduleItems.each((k, el) => {
          const $el = $(el);
          // upcoming events contain VS
          if ($el.find('span').eq(2).text() == 'VS') {
            let awayTeam = $el.find('span').eq(0).text();
            const awayLogo = this.getLogo(awayTeam);
            if ( awayTeam.length > 3 ) {
              awayTeam = awayTeam.charAt(0).toUpperCase() + awayTeam.slice(1).toLowerCase();
            }
            let homeTeam = $el.find('span').eq(3).text();
            const homeLogo = this.getLogo(homeTeam);
            if ( homeTeam.length > 3 ) {
              homeTeam = homeTeam.charAt(0).toUpperCase() + homeTeam.slice(1).toLowerCase();
            }
            // times are displayed in Korea time
            let start = moment.tz(dateString + ' ' + $el.find('span').eq(6).text(), 'ddd MMM DD HH:mm', 'Asia/Seoul').utc();

            allItems.push({
              awayLogo,
              homeLogo,
              id: `kbo-${awayTeam}-${homeTeam}-${start.valueOf()}`,
              start: start.toDate(),
              title: `${awayTeam} vs ${homeTeam}`,
            });
          }
        });
      };

      debug.saveRequestData(allItems, 'kbo', 'epg');

      await parseAirings(allItems);
    } catch (e) {
      console.error(e);
      console.log('Could not parse KBO events');
    }
  };

  public getEventData = async (id: string, retry?: boolean): Promise<TChannelPlaybackInfo> => {
    try {
      const event = await db.entries.findOneAsync<IEntry>({id});

      if (this.client_id == '') {
        await this.getClientId();
        if (this.client_id == '') {
          throw new Error('Could not get client id');
        }
      }

      const {data} = await axios.get(['https://', 'api.sooplive.com', '/stream'].join(''), {
        params: {
          limit: 20,
          page: 1,
          sort: 'viewer',
          languageCodeList: '',
          categoryIdx: SOOP_CATEGORY_ID,
        },
        headers: {
          'user-agent': userAgent,
          'accept': 'application/json',
          'accept-language': 'en-US,en;q=0.9',
          'authorization': 'Bearer undefined',
          'cache-control': 'no-cache',
          'client-id': this.client_id,
          'dnt': '1',
          'lang': 'en-US',
          'origin': 'https://www.sooplive.com',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'referer': 'https://www.sooplive.com/category/kbo-league',
          'region-code': 'NA',
        },
      });

      if (data.streamList) {
        const streamList = data.streamList;

        // live event titles are formatted ALLCAPS vs ALLCAPS
        const eventTitleSplit = event.name.split(' ');
        for (const [i, j] of [0, 2].entries()) {
          eventTitleSplit[j] = eventTitleSplit[j].toUpperCase();
        }
        const eventTitle = eventTitleSplit.join(' ');

        for (var i = 0; i < streamList.length; i++) {
          if (streamList[i].title.startsWith(eventTitle)) {
            const streamUrl = streamList[i].previewURL;
            const referer = ['https://', 'www.sooplive.com', '/', streamList[i].channelId].join('');
            const origin = ['https://', 'www.sooplive.com'].join('');
            return [streamUrl, {'user-agent': userAgent, 'origin': origin, 'referer': referer}];
          }
        }
      }

      throw new Error('Could not get stream data');
    } catch (e) {
      if (!retry && e.message != 'Could not get client id') {
        console.log('Could not get event data, attempting to refresh');
        await this.getClientId();
        await this.getEventData(id, true);
      } else {
        console.error(e);
        console.log('Could not get event data');
      }
    }
  };

  private getLogo = (team: string): string => {
    try {
      // Hanwha's logo is a different size
      const imageSize = '@2x';
      const url = ['https://', 'www.ktwiz.co.kr', '/v2/imgs/emblems/', 'ico-100-logo-', team.toLowerCase(), ((team != 'HANWHA') ? imageSize : ''), '.png'].join('');

      return url;
    } catch (e) {
      console.error(e);
      console.log('Could not get logo');
    }
  };
}

export const kboHandler = new KBOHandler();
