interface IChannelStatus {
  heartbeat?: number;
  pid?: any;
  current?: string;
  nextUp?: string;
  nextUpTimer?: any;
  player?: IManifestPlayer;
}

interface IManifestPlayer {
  m3u8?: string;
  interval?: NodeJS.Timer;

  getSegmentOrKey(segmentId: string): Promise<void>;
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
    [string: number]: IChannelStatus;
  };
}
