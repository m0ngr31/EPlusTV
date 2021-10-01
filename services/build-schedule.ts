import { db } from './database';

export const scheduleEntries = async () => {
  const unscheduledEntries = await db.entries.find({channel: {$exists: false}}).sort({start: 1});
  unscheduledEntries && unscheduledEntries.length && console.log(`There are ${unscheduledEntries.length} unscheduled entries`);

  for (const entry of unscheduledEntries) {
    const availableChannels = await db.schedule.find({endsAt: {$lt: (entry as any).start}}).sort({channel: 1});

    if (!availableChannels || !availableChannels.length) {
      const channelNums = await db.schedule.count({});

      if (channelNums > 99) {
        continue;
      }

      const newChannelNum = channelNums + 1;

      console.log('Creating a new channel: ', newChannelNum);

      await db.schedule.insert({
        channel: newChannelNum,
        endsAt: (entry as any).end,
      });

      console.log(`Assigning ${(entry as any).name} to Channel #${newChannelNum}`);
      await db.entries.update({_id: entry._id}, {$set: {channel: newChannelNum}});
    } else {
      await db.schedule.update({_id: availableChannels[0]._id}, {$set: {endsAt: (entry as any).end}});
      console.log(`Assigning ${(entry as any).name} to Channel #${(availableChannels[0] as any).channel}`);
      await db.entries.update({_id: entry._id}, {$set: {channel: (availableChannels[0] as any).channel}});
    }
  }
};
