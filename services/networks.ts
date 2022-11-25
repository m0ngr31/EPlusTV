export const useEspn1 = process.env.ESPN;
export const useEspn2 = process.env.ESPN2;
export const useEspn3 = process.env.ESPN3;
export const useEspnU = process.env.ESPNU;
export const useSec = process.env.SEC;
export const useSecPlus = process.env.SECPLUS;
export const useAccN = process.env.ACCN;
export const useAccNx = process.env.ACCNX;
export const useEspnPlus = process.env.ESPNPLUS?.toLowerCase() === 'false' ? false : true;

export const requiresProvider = useEspn1 || useEspn2 || useEspn3 || useEspnU || useSec || useSecPlus || useAccN || useAccNx;
