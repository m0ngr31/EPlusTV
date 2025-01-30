interface IChannelStatus {
  current?: string;
  player?: IManifestPlayer;
  heartbeatTimer?: NodeJS.Timer;
  heartbeat?: Date;
}

interface IManifestPlayer {
  playlist?: string;

  initialize(url: string): Promise<void>;
  getSegmentOrKey(segmentId: string): Promise<ArrayBuffer>;
  cacheChunklist(chunkListId: string): Promise<string>;
}

export interface IHeaders {
  [key: string]: string | number | string[];
}

export interface IStringObj {
  [key: string]: string;
}

export interface IAppStatus {
  channels: {
    [string: number | string]: IChannelStatus;
  };
}

export interface IJWToken {
  exp: number;
  iat: number;
  [key: string]: string | number;
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
  sport?: string;
  linear?: boolean;
  replay?: boolean;
  xmltvEnd?: number;
}

export interface IChannel {
  channel: string | number;
  endsAt: number;
}

export interface IProviderChannel {
  enabled: boolean;
  name: string;
  tmsId?: string;
  id: string;
}

export interface IProvider<T = any, M = any> {
  enabled: boolean;
  tokens?: T;
  linear_channels?: IProviderChannel[];
  name: string;
  meta?: M;
}

export interface IMiscDbEntry<T = string | number | boolean, M = any> {
  name: string;
  value: T;
  meta?: M;
}

export type THeaderInfo = IHeaders | ((eventId: string | number, currentHeaders?: IHeaders) => Promise<IHeaders>);

export type TChannelPlaybackInfo = [string, THeaderInfo];

export type ClassTypeWithoutMethods<T> = Omit<
  T,
  {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
  }[keyof T]
>;
