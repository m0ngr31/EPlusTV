import _ from 'lodash';
import xml from 'xml';
import moment from 'moment';

import { db } from './database';

export const generateXml = async (numChannels: number, startChannel: number) => {
  const wrap: any = {
    tv: [
      {
        _attr: {
          'generator-info-name': 'eplustv',
        },
      },
    ],
  };

  _.times(numChannels, i => {
    const channelNum = startChannel + i;
    wrap.tv.push({
      channel: [
        {
          _attr: {
            'id': `${channelNum}.eplustv`,
          },
        },
        {
          'display-name': [
            {
              _attr: {
                'lang': 'en',
              },
            },
            `EPlusTV ${channelNum}`,
          ]
        }
      ]
    });
  });

  const scheduledEntries = _.sortBy(await db.entries.find(e => e.channel), 'start');

  for (const entry of scheduledEntries) {
    const channelNum = startChannel + entry.channel;

    wrap.tv.push({
      programme: [
        {
          _attr: {
            'channel': `${channelNum}.eplustv`,
            start: moment(entry.start).format('YYYYMMDDHHmmss ZZ'),
            stop: moment(entry.end).format('YYYYMMDDHHmmss ZZ'),
          },
        },
        {
          title: [
            {
              _attr: {
                'lang': 'en',
              },
            },
            entry.name,
          ],
        },
        {
          desc: [
            {
              _attr: {
                'lang': 'en',
              },
            },
            entry.name,
          ]
        },
        {
          icon: [
            {
              _attr: {
                'src': entry.image,
              },
            },
          ],
        },
      ],
    });
  }

  return xml(wrap);
}