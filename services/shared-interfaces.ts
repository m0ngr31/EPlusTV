interface IChannelStatus {
  heartbeat?: number;
  current?: string;
  player?: IManifestPlayer;
}

interface IManifestPlayer {
  playlist?: string;

  init(url: string): Promise<void>;
  getSegmentOrKey(segmentId: string): Promise<ArrayBuffer>;
  cacheChunklist(chunkListId: string): Promise<string>;
}

export interface IHeaders {
  [key: string]: string | number;
}

export interface IStringObj {
  [key: string]: string;
}

export interface IAppStatus {
  channels: {
    [string: number | string]: IChannelStatus;
  };
}

export interface IEntry {
  categories: string[];
  duration: number;
  end: number;
  from: string;
  id: string;
  image: string;
  feed?: string;
  name: string;
  network: string;
  start: number;
  url?: string;
  channel?: string | number;
}

export interface IChannel {
  channel: string | number;
  endsAt: number;
}
