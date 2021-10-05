import _ from 'lodash';
import xml from 'xml';
import moment from 'moment';

import { db } from './database';

const formatCategories = categories => {
  const tagList = [];
  for (const category of categories){
    tagList.push({
      category: [
        {
          _attr: {
            'lang': 'en',
          },
        },
        category
      ]
    });
  }
  return tagList;
}

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

  const scheduledEntries = await db.entries.find({channel: {$exists: true}}).sort({start: 1});

  for (const entry of scheduledEntries) {
    const channelNum = (entry as any).channel;

    wrap.tv.push({
      programme: [
        {
          _attr: {
            'channel': `${channelNum}.eplustv`,
            start: moment((entry as any).start).format('YYYYMMDDHHmmss ZZ'),
            stop: moment((entry as any).end).format('YYYYMMDDHHmmss ZZ'),
          },
        },
        {
          title: [
            {
              _attr: {
                'lang': 'en',
              },
            },
            (entry as any).name,
          ],
        },
        {
          desc: [
            {
              _attr: {
                'lang': 'en',
              },
            },
            (entry as any).name,
          ]
        },
        {
          icon: [
            {
              _attr: {
                'src': (entry as any).image,
              },
            },
          ],
        },
        ...formatCategories((entry as any).categories)
      ],
    });
  }

  return xml(wrap);
}
