import _ from 'lodash';
import xml from 'xml';
import moment from 'moment';

import {db} from './database';
import {usesMultiple} from './networks';
import {calculateChannelFromName, CHANNELS, LINEAR_START_CHANNEL, NUM_OF_CHANNELS, START_CHANNEL} from './channels';
import {IEntry} from './shared-interfaces';

const baseCategories = ['HD', 'HDTV', 'Sports event', 'Sports'];

const formatEntryName = (entry: IEntry) => {
  let entryName = entry.name;

  if (entry.feed) {
    entryName = `${entryName} (${entry.feed})`;
  }

  if (usesMultiple && !entry.linear) {
    entryName = `${entryName} - ${entry.network}`;
  }

  if (entry.sport && !entry.linear) {
    entryName = `${entry.sport} - ${entryName}`;
  }

  return entryName;
};

const formatCategories = (categories: string[] = []) =>
  [...new Set([...baseCategories, ...categories])].map(category => ({
    category: [
      {
        _attr: {
          lang: 'en',
        },
      },
      category,
    ],
  }));

export const generateXml = async (linear = false): Promise<xml> => {
  const wrap: any = {
    tv: [
      {
        _attr: {
          'generator-info-name': 'eplustv',
        },
      },
    ],
  };

  if (linear) {
    for (const key in CHANNELS.MAP) {
      const val = CHANNELS.MAP[key];

      if (val.checkChannelEnabled) {
        const enabled = await val.checkChannelEnabled();

        if (!enabled) {
          continue;
        }
      } else if (!val.canUse) {
        continue;
      }

      const channelNum = parseInt(key, 10) + LINEAR_START_CHANNEL;

      wrap.tv.push({
        channel: [
          {
            _attr: {
              id: `${channelNum}.eplustv`,
            },
          },
          {
            'display-name': [
              {
                _attr: {
                  lang: 'en',
                },
              },
              val.name,
            ],
          },
          {
            icon: [
              {
                _attr: {
                  src: val.logo,
                },
              },
            ],
          },
        ],
      });
    }
  } else {
    _.times(NUM_OF_CHANNELS, i => {
      const channelNum = START_CHANNEL + i;

      wrap.tv.push({
        channel: [
          {
            _attr: {
              id: `${channelNum}.eplustv`,
            },
          },
          {
            'display-name': [
              {
                _attr: {
                  lang: 'en',
                },
              },
              `EPlusTV ${channelNum}`,
            ],
          },
          {
            icon: [
              {
                _attr: {
                  src: 'data:image/png;base64,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',
                },
              },
            ],
          },
        ],
      });
    });
  }

  const scheduledEntries = await db.entries
    .find<IEntry>({channel: {$exists: true}, linear: linear ? true : {$exists: false}})
    .sort({start: 1});

  for (const entry of scheduledEntries) {
    const channelNum = calculateChannelFromName(`${entry.channel}`);

    const entryName = formatEntryName(entry);

    wrap.tv.push({
      programme: [
        {
          _attr: {
            channel: `${channelNum}.eplustv`,
            start: moment(entry.start).format('YYYYMMDDHHmmss ZZ'),
            stop: moment(entry.end).format('YYYYMMDDHHmmss ZZ'),
          },
        },
        {
          title: [
            {
              _attr: {
                lang: 'en',
              },
            },
            entryName,
          ],
        },
        {
          video: {
            quality: 'HDTV',
          },
        },
        {
          desc: [
            {
              _attr: {
                lang: 'en',
              },
            },
            entryName,
          ],
        },
        {
          icon: [
            {
              _attr: {
                src: entry.image,
              },
            },
          ],
        },
        {
          live: [{}, ''],
        },
        ...(!entry.replay
          ? [
              {
                new: [{}, ''],
              },
            ]
          : []),
        ...formatCategories(entry.categories),
      ],
    });
  }

  return xml(wrap);
};
