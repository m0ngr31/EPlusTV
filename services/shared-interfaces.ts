interface IChannelStatus {
  heartbeat: number;
  pid?: any;
  current?: string;
  nextUp?: string;
  nextUpTimer?: any;
}

export interface IAppStatus {
  channels: {
    [string: number]: IChannelStatus;
  };
}
