interface IChannelStatus {
  heartbeat?: number;
  pid?: any;
  current?: string;
  nextUp?: string;
  nextUpTimer?: any;
  player?: any;
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
