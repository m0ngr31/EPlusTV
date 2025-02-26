import moment, {Moment} from 'moment-timezone';
import * as cheerio from 'cheerio';

import {IEntry, IProvider, TChannelPlaybackInfo} from './shared-interfaces';
import {db} from './database';
import {debug} from './debug';
import {normalTimeRange} from './shared-helpers';
import {getEventStream, getLiveEventsFromChannel, matchEvent} from './yt-dlp-helper';
import axios from 'axios';

const YT_CHANNEL = 'UCm-KUxgF1uOrwBb3_IRZR2A';

const TEAM_COLORS = {
  'bg-teams-atlanta-secondary': '#ff73c7',
  'bg-teams-austin-secondary': '#9e8aff',
  'bg-teams-houston-secondary': '#5b9af9',
  'bg-teams-madison-secondary': '#4de7fd',
  'bg-teams-omaha-secondary': '#33f08a',
  'bg-teams-salt-lake-secondary': '#fff84d',
};

const convertUTCToLocal = (utcTimeString: string, localDate: Moment): Moment => {
  const [time, period] = utcTimeString.split(' ');
  const [hours, minutes] = time.split(':');

  const localMoment = moment(localDate);

  const utcMoment = moment
    .utc()
    .year(localMoment.year())
    .month(localMoment.month())
    .date(localMoment.date())
    .hour(parseInt(hours) + (period.toLowerCase() === 'PM' ? 12 : 0))
    .minute(parseInt(minutes))
    .second(0);

  if (utcMoment.isBefore(localMoment)) {
    utcMoment.add(1, 'day');
  }

  return utcMoment.local();
};

interface ILovbEvent {
  image: string;
  title: string;
  start: Date;
  id: string;
}

const parseAirings = async (events: ILovbEvent[]) => {
  const [now, endSchedule] = normalTimeRange();

  for (const event of events) {
    if (!event || !event.id) {
      return;
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

      await db.entries.insertAsync<IEntry>({
        categories: [...new Set(['LOVB', 'Volleyball', "Women's Volleyball", "Women's Sports"])],
        duration: end.diff(start, 'seconds'),
        end: end.valueOf(),
        from: 'lovb',
        id: event.id,
        image: event.image,
        name: event.title,
        network: 'LOVB Live',
        originalEnd: originalEnd.valueOf(),
        sport: 'LOVB',
        start: start.valueOf(),
      });
    }
  }
};

class LOVBHandler {
  public initialize = async () => {
    const setup = (await db.providers.countAsync({name: 'lovb'})) > 0 ? true : false;

    // First time setup
    if (!setup) {
      await db.providers.insertAsync<IProvider>({
        enabled: false,
        name: 'lovb',
      });
    }

    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'lovb'});

    if (!enabled) {
      return;
    }
  };

  public getSchedule = async (): Promise<void> => {
    const {enabled} = await db.providers.findOneAsync<IProvider>({name: 'lovb'});

    if (!enabled) {
      return;
    }

    console.log('Looking for LOVB events...');

    const allItems: ILovbEvent[] = [];

    const today = new Date();

    try {
      const {data} = await axios.get('https://lovb.com/schedule');
      const $ = cheerio.load(data);

      for (const [i] of [0, 1, 2].entries()) {
        const date = moment(today).add(i, 'days');

        const scheduleItems = $(`#${date.format('YYYY-MM-DD')}`)
          .find('section')
          .has('a[href^="/schedule"]');

        scheduleItems.each((i, el) => {
          const $el = $(el);

          const teams = $el.find('a[href^="/teams/"]');

          const startTime = $el.find('.flex-row .text-pretty.text-sm').eq(2).text().trim();
          const start = moment(convertUTCToLocal(startTime, date)).startOf('minute');

          const teamArr: any[] = [];

          teams.each((i, elem) => {
            const $elem = $(elem);

            const teamName = $elem.find('.text-pretty').text().trim();
            const svgElement = $elem.find('svg');

            if (!teamName) {
              return;
            }

            let bgColorClass = '';

            $elem
              .find('div')
              .first()
              .attr('class')
              ?.split(' ')
              .forEach(cls => {
                if (cls.startsWith('bg-teams-')) {
                  bgColorClass = cls;
                }
              });

            const svgContent = $.html(svgElement);

            teamArr.push({
              backgroundColor: TEAM_COLORS[bgColorClass],
              name: teamName,
              svgContent,
            });
          });

          if (teamArr.length === 2) {
            const [team1, team2] = teamArr;

            const width = 360;
            const height = 270;

            const combinedSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <polygon points="0,0 ${width},0 0,${height}" fill="${team1.backgroundColor}" />
  <polygon points="${width},0 ${width},${height} 0,${height}" fill="${team2.backgroundColor}" />

  <g transform="translate(${width / 5 - 32}, ${height / 5 - 45}) scale(2)">
    ${team1.svgContent
      .replace(/<\?xml[^>]+>/, '')
      .replace(/<svg[^>]+>/, '')
      .replace(/<\/svg>/, '')}
  </g>

  <g transform="translate(${(width * 3) / 5 - 32}, ${height / 2 - 5}) scale(2)">
    ${team2.svgContent
      .replace(/<\?xml[^>]+>/, '')
      .replace(/<svg[^>]+>/, '')
      .replace(/<\/svg>/, '')}
  </g>
</svg>`;

            const svgBuffer = Buffer.from(combinedSvg);
            const base64String = svgBuffer.toString('base64');
            const dataUrl = `data:image/svg+xml;base64,${base64String}`;

            allItems.push({
              id: `lovb-${start.valueOf()}`,
              image: dataUrl,
              start: start.toDate(),
              title: `${team1.name} vs ${team2.name}`,
            });
          }
        });
      }

      debug.saveRequestData(allItems, 'lovb', 'epg');

      await parseAirings(allItems);
    } catch (e) {
      console.error(e);
      console.log('Could not parse LOVB events');
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

export const lovbHandler = new LOVBHandler();
