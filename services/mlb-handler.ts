import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import axios from 'axios';
import url from 'url';
import _ from 'lodash';
import jwt_decode from 'jwt-decode';
import moment from 'moment';

import {mlbUserAgent, androidMlbUserAgent, userAgent} from './user-agent';
import {configPath} from './config';
import {useMLBtv} from './networks';
import {getRandomHex} from './shared-helpers';
import {IEntry, IHeaders, IJWToken} from './shared-interfaces';
import {db} from './database';

interface IGameContent {
  media: {
    epg: {
      title: string;
      items: {
        callLetters: string;
        espnAuthRequired: boolean;
        tbsAuthRequired: boolean;
        espn2AuthRequired: boolean;
        contentId: string;
        fs1AuthRequired: boolean;
        mediaId: string;
        mediaFeedType: string;
        mlbnAuthRequired: boolean;
        foxAuthRequired: boolean;
        freeGame: boolean;
        id: number;
        abcAuthRequired: boolean;
      }[];
    }[];
    freeGame: boolean;
    enhancedGame: boolean;
  };
}

interface ITeam {
  team: {
    name: string;
    id: number;
  };
}

interface IGame {
  gamePk: number;
  description: string;
  gameDate: string;
  teams: {
    away: ITeam;
    home: ITeam;
  };
  content: IGameContent;
}

interface ISchedule {
  dates: {
    games: IGame[];
  }[];
}

const MLB_CLIENT_ID = [
  '0',
  'o',
  'a',
  '3',
  'e',
  '1',
  'n',
  'u',
  't',
  'A',
  '1',
  'H',
  'L',
  'z',
  'A',
  'K',
  'G',
  '3',
  '5',
  '6',
].join('');

const MLB_OAUTH_ID = [
  'a',
  'u',
  's',
  '1',
  'm',
  '0',
  '8',
  '8',
  'y',
  'K',
  '0',
  '7',
  'n',
  'o',
  'B',
  'f',
  'h',
  '3',
  '5',
  '6',
].join('');

const MLB_BEARER_TOKEN = [
  'b',
  'W',
  'x',
  'i',
  'd',
  'H',
  'Y',
  'm',
  'Y',
  'W',
  '5',
  'k',
  'c',
  'm',
  '9',
  'p',
  'Z',
  'C',
  'Y',
  'x',
  'L',
  'j',
  'A',
  'u',
  'M',
  'A',
  '.',
  '6',
  'L',
  'Z',
  'M',
  'b',
  'H',
  '2',
  'r',
  '-',
  '-',
  'r',
  'b',
  'X',
  'c',
  'g',
  'E',
  'a',
  'b',
  'a',
  'D',
  'd',
  'I',
  's',
  'l',
  'p',
  'o',
  '4',
  'R',
  'y',
  'Z',
  'r',
  'l',
  'V',
  'f',
  'W',
  'Z',
  'h',
  's',
  'A',
  'g',
  'X',
  'I',
  'k',
].join('');

const generateThumb = (home: ITeam, away: ITeam): string =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/ar_167:215,c_crop/fl_relative,l_team:${home.team.id}:fill:spot.png,w_1.0,h_1,x_0.5,y_0,fl_no_overflow,e_distort:100p:0:200p:0:200p:100p:0:100p/fl_relative,l_team:${away.team.id}:logo:spot:current,w_0.38,x_-0.25,y_-0.16/fl_relative,l_team:${home.team.id}:logo:spot:current,w_0.38,x_0.25,y_0.16/w_750/team/${away.team.id}/fill/spot.png`;

const parseAirings = async (events: IGame[]) => {
  const now = moment();

  for (const event of events) {
    for (const epg of event.content?.media?.epg || []) {
      if (epg.title === 'MLBTV') {
        for (const item of epg.items) {
          if (item.contentId) {
            const entryExists = await db.entries.findOne<IEntry>({id: item.contentId});

            if (!entryExists) {
              if (process.env.MLBTV_ONLY_FREE && !item.freeGame) {
                continue;
              }

              const end = moment(event.gameDate).add(4, 'hours');

              if (end.isBefore(now)) {
                continue;
              }

              const gameName = `${event.teams.away.team.name} @ ${event.teams.home.team.name} - ${item.mediaFeedType}`;

              console.log('Adding event: ', gameName);

              await db.entries.insert<IEntry>({
                categories: ['Baseball', 'MLB', event.teams.home.team.name, event.teams.away.team.name],
                duration: 60 * 60 * 5,
                end: end.valueOf(),
                from: 'mlbtv',
                id: item.contentId,
                image: generateThumb(event.teams.home, event.teams.away),
                name: gameName,
                network: item.callLetters,
                start: new Date(event.gameDate).valueOf(),
              });
            }
          }
        }
      }
    }
  }
};

const willAuthTokenExpire = (token?: string): boolean => {
  if (!token) return true;

  try {
    const decoded: IJWToken = jwt_decode(token);
    // Will the token expire in the next 5 hours?
    return Math.floor(new Date().valueOf() / 1000) + 3600 * 5 > decoded.exp;
  } catch (e) {
    return true;
  }
};

class MLBHandler {
  public device_id?: string;
  public auth_token?: string;

  public initialize = async () => {
    if (!useMLBtv) {
      return;
    }

    // Load tokens from local file and make sure they are valid
    this.load();

    if (!this.device_id) {
      this.device_id = _.take(getRandomHex(), 16).join('');
      this.save();
    }

    if (!this.auth_token || willAuthTokenExpire(this.auth_token)) {
      await this.login();
    }
  };

  public refreshTokens = async () => {
    if (!useMLBtv) {
      return;
    }

    if (willAuthTokenExpire(this.auth_token)) {
      await this.login();
    }
  };

  public getSchedule = async (): Promise<void> => {
    if (!useMLBtv) {
      return;
    }

    console.log('Looking for MLB.tv events...');

    try {
      const entries = await this.getEvents();
      await parseAirings(entries);
    } catch (e) {
      console.error(e);
      console.log('Could not parse MLB.tv events');
    }
  };

  public getEventData = async (event: IEntry): Promise<[string, IHeaders]> => {
    try {
      const entitlement = await this.mediaEntitlement();
      const accessToken = await this.accessToken(entitlement);
      let playbackUrl = await this.playbackUrl(event.id, accessToken);

      playbackUrl = playbackUrl.replace('{scenario}', 'browser~csai');

      const {data} = await axios.get(playbackUrl, {
        headers: {
          Accept: 'application/vnd.media-service+json; version=2',
          Authorization: accessToken,
          'User-Agent': userAgent,
          'X-BAMSDK-Platform': 'windows',
          'X-BAMSDK-Version': '3.0',
        },
      });

      let url: string;

      if (data.stream.complete) {
        url = data.stream.complete;
      } else {
        url = data.stream.slide;
      }

      return [
        url,
        {
          Authorization: accessToken,
          'User-Agent': userAgent,
        },
      ];
    } catch (e) {
      console.error(e);
      console.log('Could not start playback');
    }
  };

  private getEvents = async (): Promise<any[]> => {
    let entries = [];

    try {
      const startDate = moment();
      const endDate = moment().add(2, 'days');

      const url = [
        'https://statsapi.mlb.com',
        '/api/v1/schedule',
        '?hydrate=game(content(media(all))),team,flags,gameInfo',
        '&sportId=1',
        `&startDate=${startDate.format('YYYY-MM-DD')}`,
        `&endDate=${endDate.format('YYYY-MM-DD')}`,
      ].join('');

      const {data} = await axios.get<ISchedule>(url, {
        headers: {
          'User-Agent': mlbUserAgent,
        },
      });

      data.dates.forEach(date => (entries = [...entries, ...date.games]));
    } catch (e) {
      throw new Error(e);
    }

    return entries;
  };

  private playbackUrl = async (contendId: string, accessToken: string): Promise<string> => {
    try {
      const {data} = await axios.get(
        `https://search-api-mlbtv.mlb.com/svc/search/v2/graphql/persisted/query/core/Airings?variables=%7B%22contentId%22%3A%22${contendId}%22%7D`,
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': androidMlbUserAgent,
            'X-BAMSDK-Platform': 'android-tv',
            'X-BAMSDK-Version': 'v4.3.0',
          },
        },
      );

      return data.data.Airings[0].playbackUrls[0].href;
    } catch (e) {
      console.error(e);
      console.log('Could not get playback URL!');
    }
  };

  private accessToken = async (entitlement: string): Promise<string> => {
    const reqBody = new url.URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      platform: 'android-tv',
      subject_token: entitlement,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    });

    try {
      const {data} = await axios.post('https://us.edge.bamgrid.com/token', reqBody.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${MLB_BEARER_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return data.access_token;
    } catch (e) {
      console.error(e);
      console.log('Could not get access token!');
    }
  };

  private mediaEntitlement = async (): Promise<string> => {
    try {
      const {data} = await axios.get(
        `https://media-entitlement.mlb.com/api/v3/jwt?os=Android&appname=AtBat&did=${this.device_id}`,
        {
          headers: {
            Authorization: `Bearer ${this.auth_token}`,
            'User-Agent': mlbUserAgent,
          },
        },
      );

      return data;
    } catch (e) {
      console.error(e);
      console.log('Could not get media entitlement!');
    }
  };

  private login = async (): Promise<void> => {
    const loginBody = new url.URLSearchParams({
      client_id: MLB_CLIENT_ID,
      grant_type: 'password',
      password: process.env.MLBTV_PASS,
      scope: 'openid offline_access',
      username: process.env.MLBTV_USER,
    });

    try {
      const {data} = await axios.post(`https://ids.mlb.com/oauth2/${MLB_OAUTH_ID}/v1/token`, loginBody.toString(), {
        headers: {
          'User-Agent': mlbUserAgent,
        },
      });

      this.auth_token = data.access_token;
      this.save();
    } catch (e) {
      console.error(e);
      console.log('Could not login to MLB.tv!');
    }
  };

  private save = () => {
    fsExtra.writeJSONSync(path.join(configPath, 'mlb_tokens.json'), this, {spaces: 2});
  };

  private load = () => {
    if (fs.existsSync(path.join(configPath, 'mlb_tokens.json'))) {
      const {device_id, auth_token} = fsExtra.readJSONSync(path.join(configPath, 'mlb_tokens.json'));

      this.device_id = device_id;
      this.auth_token = auth_token;
    }
  };
}

export const mlbHandler = new MLBHandler();
