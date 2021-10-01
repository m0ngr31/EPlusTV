import _ from 'lodash';
import {v4 as uuid4} from 'uuid';

import { db } from './database';

export const scheduleEntries = async () => {
  const unscheduledEntries = _.sortBy(await db.entries.find(e => !e.channel), 'start');
  unscheduledEntries && unscheduledEntries.length && console.log(`There are ${unscheduledEntries.length} unscheduled entries`);

  for (const entry of unscheduledEntries) {
    const availableChannels = _.sortBy(await db.schedule.find(c => c.endsAt < entry.start), 'channel');

    if (!availableChannels || !availableChannels.length) {
      const channelNums = (await db.schedule.find(s => s)).length;

      if (channelNums > 99) {
        continue;
      }

      const newChannelNum = channelNums + 1;

      console.log('Creating a new channel: ', newChannelNum);

      await db.schedule.save({
        channel: newChannelNum,
        endsAt: entry.end,
        id: uuid4(),
      });

      console.log(`Assigning ${entry.name} to Channel #${newChannelNum}`);
      await db.entries.update({...entry, channel: newChannelNum});
    } else {
      await db.schedule.update({ ...availableChannels[0], endsAt: entry.end });
      console.log(`Assigning ${entry.name} to Channel #${availableChannels[0].channel}`);
      await db.entries.update({ ...entry, channel: availableChannels[0].channel });
    }
  }
};