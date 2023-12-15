export const useEspn1 = process.env.ESPN?.toLowerCase() === 'true' ? true : false;
export const useEspn2 = process.env.ESPN2?.toLowerCase() === 'true' ? true : false;
export const useEspn3 = process.env.ESPN3?.toLowerCase() === 'true' ? true : false;
export const useEspnU = process.env.ESPNU?.toLowerCase() === 'true' ? true : false;
export const useSec = process.env.SEC?.toLowerCase() === 'true' ? true : false;
export const useSecPlus = process.env.SECPLUS?.toLowerCase() === 'true' ? true : false;
export const useAccN = process.env.ACCN?.toLowerCase() === 'true' ? true : false;
export const useAccNx = process.env.ACCNX?.toLowerCase() === 'true' ? true : false;
export const useLonghorn = process.env.LONGHORN?.toLowerCase() === 'true' ? true : false;
export const useEspnews = process.env.ESPNEWS?.toLowerCase() === 'true' ? true : false;
export const useEspnPpv = process.env.ESPN_PPV?.toLowerCase() === 'true' ? true : false;
export const useEspnPlus = process.env.ESPNPLUS?.toLowerCase() === 'false' ? false : true;

export const useFoxSports = process.env.FOXSPORTS?.toLowerCase() === 'true' ? true : false;
export const useFoxOnly4k = process.env.FOX_ONLY_4K?.toLowerCase() === 'true' ? true : false;

export const useMLBtv = process.env.MLBTV?.toLowerCase() === 'true' ? true : false;

export const useParamountPlus = process.env.PARAMOUNTPLUS?.toLowerCase() === 'true' ? true : false;

export const requiresEspnProvider =
  useEspn1 ||
  useEspn2 ||
  useEspn3 ||
  useEspnU ||
  useSec ||
  useSecPlus ||
  useAccN ||
  useLonghorn ||
  useAccNx ||
  useEspnews;

export const usesMultiple =
  ((useFoxSports || useMLBtv || useParamountPlus) && (requiresEspnProvider || useEspnPlus)) ||
  (requiresEspnProvider && useEspnPlus);

export const useLinear = process.env.USE_LINEAR && (requiresEspnProvider || useFoxSports);

export const digitalNetworks = ['ESPN+', 'ESPN3', 'SEC Network +', 'ACCNX', 'FS1-DIGITAL'];
