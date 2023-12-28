import fs from 'fs';

import {NUM_OF_CHANNELS, START_CHANNEL} from './channels';
import {db, IDocument, linearDb} from './database';
import {IChannel, IEntry} from './shared-interfaces';

const scheduleEntry = async (entry: IEntry & IDocument, startChannel: number): Promise<void> => {
  let channelNum: number;

  const availableChannels = await db.schedule
    .find<IChannel>({channel: {$gte: startChannel}, endsAt: {$lt: entry.start}})
    .sort({channel: 1});

  if (!availableChannels || !availableChannels.length) {
    const channelNums = await db.schedule.count({});

    if (channelNums > NUM_OF_CHANNELS - 1) {
      return;
    }

    channelNum = channelNums + startChannel;

    await db.schedule.insert<IChannel>({
      channel: channelNum,
      endsAt: entry.end,
    });
  } else {
    channelNum = +availableChannels[0].channel;

    await db.schedule.update<IChannel>({_id: availableChannels[0]._id}, {$set: {endsAt: entry.end}});
  }

  await db.entries.update<IEntry>({_id: entry._id}, {$set: {channel: channelNum}});
};

export const scheduleEntries = async (): Promise<void> => {
  let needReschedule = false;

  try {
    // Check to see if we still have linear channels scheduled
    const linearChannelNums = await db.linear?.remove({}, {multi: true});

    if (linearChannelNums > 0) {
      needReschedule = true;
      fs.rmSync(linearDb);
    }
  } catch (e) {}

  if (needReschedule) {
    console.log('');
    console.log('====================================================================');
    console.log('===                                                              ===');
    console.log('=== Need to rebuild the schedule because the USE_LINEAR variable ===');
    console.log('===                   is no longer being used.                   ===');
    console.log('===                                                              ===');
    console.log('====================================================================');
    console.log('===  THIS WILL BREAK SCHEDULED RECORDINGS IN YOUR DVR SOFTWARE   ===');
    console.log('====================================================================');
    console.log('');

    await db.entries.update<IEntry>({}, {$unset: {channel: true}}, {multi: true});
    await db.schedule.remove({}, {multi: true});

    return await scheduleEntries();
  } else {
    const unscheduledEntries = await db.entries.find<IEntry>({channel: {$exists: false}}).sort({start: 1});

    unscheduledEntries && console.log(`Scheduling ${unscheduledEntries.length} entries...`);

    for (const entry of unscheduledEntries) {
      await scheduleEntry(entry, START_CHANNEL);
    }
  }
};
