import moment from 'moment-timezone';
import * as cheerio from 'cheerio';

import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {combineImages, normalTimeRange, sleep} from './shared-helpers';
import {jsDomHelper} from './jsdom-helper';
import {getEventStream, getLiveEventsFromChannel, matchEvent} from './yt-dlp-helper';

const YT_CHANNEL = 'UCNKUkQV2R0JKakyE1vuC1lQ';

interface IPWHLEvent {
  awayLogo: string;
  homeLogo: string;
  title: string;
  start: Date;
  id: string;
}

const parseAirings = async (events: IPWHLEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      continue;
    }

    const entryExists = await db.entries.findOneAsync<IEntry>({id: event.id});

    if (!entryExists) {
      const start = moment(event.start);
      const end = moment(event.start).add(3.5, 'hours');
      const originalEnd = moment(end);

      if (end.isBefore(now) || start.isAfter(endSchedule)) {
        continue;
      }

      console.log('Adding event: ', event.title);

      const image = await combineImages(event.homeLogo, event.awayLogo);

      await db.entries.insertAsync<IEntry>({
        categories: [...new Set(['PWHL', 'Ice Hockey', "Women's Sports"])],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'pwhl',
        id: event.id,
        image,
        name: event.title,
        network: 'Youtube',
        originalEnd: originalEnd.valueOf(),
        sport: 'PWHL',
        start: start.valueOf(),
      });
    }
  }
};

class PWHLHandler {
  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'pwhl'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      await db.providers.insertAsync<IProvider>({
        enabled: false,
        name: 'pwhl',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'pwhl'});

    if (!enabled) {
      return;
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'pwhl'});

    if (!enabled) {
      return;
    }

    const currentDate = moment();
    let currentYear = currentDate.year();

    const allItems: IPWHLEvent[] = [];

    console.log('Looking for PWHL events...');

    try {
      const dom = await jsDomHelper('https://www.thepwhl.com/en/schedule');

      let a = 0;

      while (a < 100) {
        const $ = cheerio.load(dom.serialize());
        const scheduleItems = $('.ht-ids-preview');

        if (scheduleItems.length > 0) {
          scheduleItems.each((i, el) => {
            const $el = $(el);
            const teams = $el.find('.ht-ids-team');
            const homeTeam = teams.eq(1).find('a').attr('title').replace(' Roster', '').trim().replace(/ +/g, ' ');
            const homeLogo = teams.eq(1).find('a').find('img').attr('src');
            const awayTeam = teams.eq(0).find('a').attr('title').replace(' Roster', '').trim().replace(/ +/g, ' ');
            const awayLogo = teams.eq(0).find('a').find('img').attr('src');
            const date = $el.find('.ht-ids-date').text().trim();
            const time = $el.find('.ht-ids-time').text().trim();

            const gameDate = moment
              .tz(`${date} ${currentYear} ${time}`, 'ddd, MMM D YYYY h:mm A z', 'America/New_York')
              .startOf('minute');

            if (gameDate.isBefore(currentDate.add(-1, 'month'))) {
              gameDate.add(1, 'year');

              if (gameDate.year() !== currentYear) {
                currentYear = gameDate.year();
              }
            }

            allItems.push({
              awayLogo,
              homeLogo,
              id: `pwhl-${gameDate.valueOf()}`,
              start: gameDate.toDate(),
              title: `${homeTeam} vs ${awayTeam}`,
            });
          });

          a = 1000;
          break;
        }

        await sleep(100);
        a++;
      }

      dom.window.close();

      debug.saveRequestData(allItems, 'pwhl', 'epg');

      await parseAirings(allItems);
    } catch (e) {
      console.error(e);
      console.log('Could not parse PWHL events');
    }
  };

  public getEventData = async (id: string): Promise<TChannelPlaybackInfo> => {
    try {
      const event = await db.entries.findOneAsync<IEntry>({id});

      const channelStreams = await getLiveEventsFromChannel(YT_CHANNEL);
      const matchedEvent = matchEvent(channelStreams, event.name);

      if (!matchedEvent) {
        throw new Error('Could not get event data');
      }

      const streamUrl = await getEventStream(matchedEvent.id);

      if (streamUrl) {
        return [streamUrl, {}];
      }

      throw new Error('Could not get event data');
    } catch (e) {
      console.error(e);
      console.log('Could not get event data');
    }
  };
}

export const pwhlHandler = new PWHLHandler();
