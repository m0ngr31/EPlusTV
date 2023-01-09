interface IChannelStatus {
  heartbeat?: number;
  pid?: any;
  current?: string;
  nextUp?: string;
  nextUpTimer?: any;
  player?: IManifestPlayer;
  playingSlate?: boolean;
}

interface IManifestPlayer {
  m3u8?: string;
  interval?: NodeJS.Timer;

  getSegmentOrKey(segmentId: string): Promise<ArrayBuffer>;
  stop(): void;
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
