import {NUM_OF_CHANNELS, START_CHANNEL, useLinear} from './channels';
import {db, IDocument} from './database';
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

  if (!useLinear) {
    const linearEntries = await db.entries.count({linear: {$exists: true}});

    if (linearEntries > 0) {
      needReschedule = true;
    }
  }

  if (needReschedule) {
    console.log('');
    console.log('====================================================================');
    console.log('===                                                              ===');
    console.log('===   Need to rebuild the schedule because the LINEAR_CHANNELS   ===');
    console.log('===            variable is no longer being used.                 ===');
    console.log('===                                                              ===');
    console.log('====================================================================');
    console.log('===  THIS WILL BREAK SCHEDULED RECORDINGS IN YOUR DVR SOFTWARE   ===');
    console.log('====================================================================');
    console.log('');

    await db.schedule.remove({}, {multi: true});
    await db.entries.update<IEntry>({}, {$unset: {channel: true, linear: true}}, {multi: true});

    return await scheduleEntries();
  }

  const unscheduledEntries = await db.entries.find<IEntry>({channel: {$exists: false}}).sort({start: 1});

  unscheduledEntries.length > 0 && console.log(`Scheduling ${unscheduledEntries.length} entries...`);

  for (const entry of unscheduledEntries) {
    await scheduleEntry(entry, START_CHANNEL);
  }
};
