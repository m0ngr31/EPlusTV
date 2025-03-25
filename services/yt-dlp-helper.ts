import ytdlpWrap from 'yt-dlp-wrap';

const ytdlp = new ytdlpWrap();

interface ILiveStream {
  id: string;
  title: string;
  description: string;
}

export const getLiveEventsFromChannel = async (channelId: string): Promise<ILiveStream[]> => {
  const options = [
    '--flat-playlist',
    '--match-filter',
    'live_status=is_live',
    '--playlist-items',
    '1-10',
    '--dump-json',
  ];

  try {
    const rawStreams = await ytdlp.execPromise([`https://www.youtube.com/channel/${channelId}/streams`, ...options]);

    if (rawStreams && rawStreams.length > 0) {
      return rawStreams
        .split('\n')
        .filter(a => a)
        .map(e => JSON.parse(e) as ILiveStream);
    }

    return [];
  } catch (e) {
    console.error(e);
    console.log('Could not get live streams for channel: ', channelId);
  }
};

export const matchEvent = (streams: ILiveStream[], title: string): ILiveStream | undefined => {
  const [homeTeam, awayTeam] = title.split(' vs ');

  return streams.find(a => a.title.indexOf(homeTeam) > -1 || a.title.indexOf(awayTeam) > -1);
};

export const getEventStream = async (videoId: string): Promise<string | undefined> => {
  const options = ['--print', '%(manifest_url)s'];

  try {
    const streamRaw = await ytdlp.execPromise([`https://www.youtube.com/watch?v=${videoId}`, ...options]);

    if (streamRaw && streamRaw.length > 0) {
      return streamRaw.trim();
    } else {
      throw new Error(`Could not get m3u8 for video: ${videoId}`);
    }
  } catch (e) {
    console.error(e);
    console.log('Could not get m3u8 for video: ', videoId);
  }
};
