const BASE_PERMISSIONS = ['urn:package:superuser', 'urn:package:dtc:bundle:monthly', 'urn:package:dtc:bundle:annual'];

export const YES_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  'urn:package:dtc:yes:monthly',
  'urn:package:dtc:yes:annual',
  'urn:package:tve:yes:yesn',
  'urn:package:yes:superuser',
];

export const MSG_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  'urn:package:dtc:msg:monthly',
  'urn:package:dtc:msg:annual',
  'urn:package:tve:msg:msggo',
  'urn:package:msg:superuser',
];

export interface IMSGChannel {
  channelId: string;
  checkChannelEnabled?: () => Promise<boolean> | boolean;
  id: string;
  logo: string;
  name: string;
  stationId: string;
  tvgName: string;
}

export interface IMSGChannelGroup {
  [channelNumber: number]: IMSGChannel;
}

interface IMSGChannelMap {
  [key: string]: IMSGChannelGroup;
}

const YES = {
  64: {
    channelId: 'BD50D13C-CC01-4518-AD42-B3EFACF1DBF5',
    id: 'YES',
    logo: 'https://tmsimg.fancybits.co/assets/s30017_ll_h15_aa.png?w=360&h=270',
    name: 'Yes Network',
    stationId: '30017',
    tvgName: 'YES',
  },
} as const;

export const MSG_LINEAR: IMSGChannelMap = {
  'zone-1': {
    60: {
      channelId: '057E6429-044F-49E6-9E97-64D617B4D3CD',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG',
      stationId: '10979',
      tvgName: 'MSG',
    },
    61: {
      channelId: '6D250945-BB55-44D4-A5A9-3DF45DBE134E',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet HD',
      stationId: '15273',
      tvgName: 'MSGSNNP',
    },
    62: {
      channelId: 'F1DA3786-A8A2-4C3D-B18E-F400F9C6EE0B',
      id: 'MSG2',
      logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
      name: 'MSG2 HD',
      stationId: '70283',
      tvgName: 'MSG2HD',
    },
    63: {
      channelId: '0135EBDF-184F-41FA-B36C-46CDA4FC9B33',
      id: 'MSGSN2',
      logo: 'https://tmsimg.fancybits.co/assets/s70285_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Sportsnet 2 HD',
      stationId: '70285',
      tvgName: 'MSG2SNH',
    },
    ...YES,
  },
  'zone-2': {
    60: {
      channelId: '02A9C85D-8E30-4D13-9EE1-FB137CF6C66C',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 2',
      stationId: '42110',
      tvgName: 'MSGZN2',
    },
    61: {
      channelId: '89648E11-56FB-4A68-9B0B-D3ECC48FA75E',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s12605_ll_h15_aa.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 2',
      stationId: '12605',
      tvgName: 'MSGSNZ2',
    },
    62: {
      channelId: '4A064EDA-8704-441A-B462-7F4DE770FE96',
      id: 'MSG2',
      logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
      name: 'MSG2 Zone 2',
      stationId: '70283',
      tvgName: 'MSG2HD',
    },
    63: {
      channelId: 'F0A73CE5-6429-48A0-8551-FAFEA19C0A2B',
      id: 'MSGSN2',
      logo: 'https://tmsimg.fancybits.co/assets/s70285_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Sportsnet 2 Zone 2',
      stationId: '65623',
      tvgName: 'MSGSN22',
    },
    ...YES,
  },
  'zone-3': {
    60: {
      channelId: '4988B12E-F8D3-4E1B-A541-6072469122BE',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 3',
      stationId: '42111',
      tvgName: 'MSGZN3',
    },
    61: {
      channelId: '9A3CCB0A-49D1-41A5-A4FA-58C1B815625E',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 3',
      stationId: '12338',
      tvgName: 'MSGSNZ3',
    },
    ...YES,
  },
  'zone-4': {
    60: {
      channelId: 'F2986D08-F7D4-46A6-9C8E-A9B3C886730D',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 4',
      stationId: '35555',
      tvgName: 'MSG4',
    },
    61: {
      channelId: '7B321549-610E-4CBC-94FF-76F50E29D972',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 4',
      stationId: '15231',
      tvgName: 'MSGSNZ4',
    },
    ...YES,
  },
  'zone-5': {
    60: {
      channelId: '8279CA06-43E9-4064-AB51-E29696F200E1',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 5',
      stationId: '35555',
      tvgName: 'MSGZN5',
    },
    61: {
      channelId: '41AFBC0C-219E-4FF1-826B-024E32167684',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 5',
      stationId: '71133',
      tvgName: 'MSGSNZ5',
    },
    ...YES,
  },
  'zone-6': {
    60: {
      channelId: 'D3C34F36-33B2-4909-A4C4-FF75B37D39C1',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 6',
      stationId: '106048',
      tvgName: 'MSGZN6',
    },
    ...YES,
  },
  'zone-7': {
    60: {
      channelId: '297036E6-08E6-431F-A644-B2E003DACA48',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 3',
      stationId: '42111',
      tvgName: 'MSGZN3',
    },
  },
  'zone-8': {
    60: {
      channelId: '43CA0781-CAD2-4D46-A8CE-6E67F2CB8DAE',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG',
      stationId: '10979',
      tvgName: 'MSG',
    },
    62: {
      channelId: '7C2382DE-6FE1-4DAD-B7EA-F5C6FEDAA460',
      id: 'MSG2',
      logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
      name: 'MSG2 HD',
      stationId: '70283',
      tvgName: 'MSG2HD',
    },
    ...YES,
  },
  'zone-9': {
    60: {
      channelId: 'B91A0053-DB0C-470A-B031-32EBD3F61C77',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 10',
      stationId: '101378',
      tvgName: 'MSGZN10',
    },
    61: {
      channelId: '6444D94B-8D03-433B-B593-C321185BBA45',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 3',
      stationId: '12338',
      tvgName: 'MSGSNZ3',
    },
    62: {
      channelId: '386186BD-E57C-4BC0-9A49-C6EBDE9FD5E3',
      id: 'MSG2',
      logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
      name: 'MSG2 HD',
      stationId: '70283',
      tvgName: 'MSG2HD',
    },
    ...YES,
  },
  // eslint-disable-next-line sort-keys-custom-order-fix/sort-keys-custom-order-fix
  'zone-10': {
    60: {
      channelId: 'FCA11159-7246-4EAA-9298-74D131367BFB',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 10',
      stationId: '101378',
      tvgName: 'MSGZN10',
    },
    61: {
      channelId: '7B347484-D367-44EE-8BE8-49849D85CD58',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 10',
      stationId: '100342',
      tvgName: 'MSGSN10',
    },
    62: {
      channelId: '7AAC51AF-7AD9-4B9B-B0A3-04969DFD578E',
      id: 'MSG2',
      logo: 'https://tmsimg.fancybits.co/assets/s70283_ll_h15_aa.png?w=360&h=270',
      name: 'MSG2 Zone 2',
      stationId: '70283',
      tvgName: 'MSG2HD',
    },
    63: {
      channelId: '635C4873-0F80-42E1-BA01-F910EFE8B0BE',
      id: 'MSGSN2',
      logo: 'https://tmsimg.fancybits.co/assets/s70285_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Sportsnet 2 Zone 2',
      stationId: '65623',
      tvgName: 'MSGSN22',
    },
    ...YES,
  },
  'zone-11': {
    60: {
      channelId: '1455B565-32F1-4F27-8590-CEF2989B72DD',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG National',
      stationId: '80169',
      tvgName: 'MSGN',
    },
    61: {
      channelId: '417E2B8-B100-49EB-B5CE-1B077888D253',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet HD',
      stationId: '15273',
      tvgName: 'MSGSNNP',
    },
    ...YES,
  },
  'zone-12': {
    ...YES,
  },
  'zone-13': {
    ...YES,
  },
  'zone-14': {
    ...YES,
  },
  'zone-15': {
    60: {
      channelId: 'F2986D08-F7D4-46A6-9C8E-A9B3C886730D',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 4',
      stationId: '35555',
      tvgName: 'MSG4',
    },
    61: {
      channelId: '7B321549-610E-4CBC-94FF-76F50E29D972',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 4',
      stationId: '15231',
      tvgName: 'MSGSNZ4',
    },
    ...YES,
  },
  'zone-17': {
    60: {
      channelId: 'D3C34F36-33B2-4909-A4C4-FF75B37D39C1',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG Zone 6',
      stationId: '106048',
      tvgName: 'MSGZN6',
    },
  },
  'zone-18': {
    60: {
      channelId: '8279CA06-43E9-4064-AB51-E29696F200E1',
      id: 'MSG',
      logo: 'https://tmsimg.fancybits.co/assets/s10979_ll_h15_ab.png?w=360&h=270',
      name: 'MSG',
      stationId: '10979',
      tvgName: 'MSG',
    },
    61: {
      channelId: '41AFBC0C-219E-4FF1-826B-024E32167684',
      id: 'MSGSN',
      logo: 'https://tmsimg.fancybits.co/assets/s11105_ll_h15_ac.png?w=360&h=270',
      name: 'MSG Sportsnet Zone 5',
      stationId: '71133',
      tvgName: 'MSGSNZ5',
    },
  },
} as const;
