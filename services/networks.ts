export const useEspn1 = process.env.ESPN?.toLowerCase() === 'true' ? true : false;
export const useEspn2 = process.env.ESPN2?.toLowerCase() === 'true' ? true : false;
export const useEspn3 = process.env.ESPN3?.toLowerCase() === 'true' ? true : false;
export const useEspnU = process.env.ESPNU?.toLowerCase() === 'true' ? true : false;
export const useSec = process.env.SEC?.toLowerCase() === 'true' ? true : false;
export const useSecPlus = process.env.SECPLUS?.toLowerCase() === 'true' ? true : false;
export const useAccN = process.env.ACCN?.toLowerCase() === 'true' ? true : false;
export const useAccNx = process.env.ACCNX?.toLowerCase() === 'true' ? true : false;
export const useEspnews = process.env.ESPNEWS?.toLowerCase() === 'true' ? true : false;
export const useEspnPpv = process.env.ESPN_PPV?.toLowerCase() === 'true' ? true : false;
export const useEspnPlus = process.env.ESPNPLUS?.toLowerCase() === 'false' ? false : true;

export const useFoxSports = process.env.FOXSPORTS?.toLowerCase() === 'true' ? true : false;
export const useFoxOnly4k = process.env.FOX_ONLY_4K?.toLowerCase() === 'true' ? true : false;

export const useMLBtv = process.env.MLBTV?.toLowerCase() === 'true' ? true : false;
export const useMLBtvOnlyFree = process.env.MLBTV_ONLY_FREE?.toLowerCase() === 'true' ? true : false;

export const useB1GPlus = process.env.B1GPLUS?.toLowerCase() === 'true' ? true : false;

export const useCBSSports = process.env.CBSSPORTS?.toLowerCase() === 'true' ? true : false;

export const useFloSports = process.env.FLOSPORTS?.toLowerCase() === 'true' ? true : false;

export const useNesn = process.env.NESN?.toLowerCase() === 'true' ? true : false;

export const useParamount = {
  _cbsSportsHq: process.env.CBSSPORTSHQ?.toLowerCase() === 'true' ? true : false,
  _golazo: process.env.GOLAZO?.toLowerCase() === 'true' ? true : false,
  get cbsSportsHq(): boolean {
    return this._cbsSportsHq && this.plus;
  },
  get golazo(): boolean {
    return this._golazo && this.plus;
  },
  plus: process.env.PARAMOUNTPLUS?.toLowerCase() === 'true' ? true : false,
};

export const useMsgPlus = process.env.MSGPLUS?.toLowerCase() === 'true' ? true : false;

export const useNfl = {
  _channel: process.env.NFLCHANNEL?.toLowerCase() === 'true' ? true : false,
  _network: process.env.NFLNETWORK?.toLowerCase() === 'true' ? true : false,
  _peacock: process.env.NFL_PEACOCK?.toLowerCase() === 'true' ? true : false,
  _prime: process.env.NFL_PRIME?.toLowerCase() === 'true' ? true : false,
  _redZone: false,
  _sunday_ticket: process.env.NFL_SUNDAY_TICKET?.toLowerCase() === 'true' ? true : false,
  _tve: process.env.NFL_TVE?.toLowerCase() === 'true' ? true : false,
  get channel(): boolean {
    return this._channel && this.plus;
  },
  get network(): boolean {
    return this._network && this.plus;
  },
  set network(value: boolean) {
    this._network = value;
  },
  get peacock(): boolean {
    return this._peacock && this.plus;
  },
  plus: process.env.NFLPLUS?.toLowerCase() === 'true' ? true : false,
  get prime(): boolean {
    return this._prime && this.plus;
  },
  get redZone(): boolean {
    return this._redZone && this.plus;
  },
  set redZone(value: boolean) {
    this._redZone = value;
  },
  get sundayTicket(): boolean {
    return this._sunday_ticket && this.plus;
  },
  get tve(): boolean {
    return this._tve && this.plus;
  },
};

export const useMountainWest = process.env.MTNWEST?.toLowerCase() === 'true' ? true : false;

export const requiresEspnProvider =
  useEspn1 || useEspn2 || useEspn3 || useEspnU || useSec || useSecPlus || useAccN || useAccNx || useEspnews;
