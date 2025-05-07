import axios from 'axios';

import {userAgent} from './user-agent';

export interface ITubiRes {
  video_resources: {
    type: string;
    manifest: {
      url: string;
    };
  }[];
  programs: ITubiEvent[];
}

export interface ITubiEvent {
  images: {
    thumbnail: string[];
    poster: string[];
  };
  title: string;
  start_time: string;
  end_time: string;
  description: string;
  id: string;
}

export const tubiHelper = async (channelId: string | number): Promise<ITubiRes> => {
  try {
    const url = [
      'https://',
      'epg-cdn.production-public.tubi.io',
      '/content/epg/programming',
      '?content_id=',
      channelId,
      '&platform=web',
    ].join('');

    const {data} = await axios.get<{rows: ITubiRes[]}>(url, {
      headers: {
        'user-agent': userAgent,
      },
    });

    return data.rows[0];
  } catch (e) {
    console.error(e);
    console.log('Could not get Tubi channel data');
  }
};
