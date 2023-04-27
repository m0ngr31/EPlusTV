import _ from 'lodash';

import {NUM_OF_CHANNELS, START_CHANNEL} from './channels';
import {db, IDocument} from './database';
import {digitalNetworks, useLinear} from './networks';
import {IChannel, IEntry, ILinearChannel} from './shared-interfaces';

const isDigitalNetwork = (network: string): boolean =>
  _.some(digitalNetworks, n => n === network) || network.indexOf('-DIGITAL') > -1;
const isEventOnLinear = (event: IEntry): boolean => event.from !== 'mlbtv' && !isDigitalNetwork(event.network);

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

const scheduleLinearEntries = async (): Promise<void> => {
  const unscheduledLinearEntries = await db.entries.find<IEntry>({channel: {$exists: false}}).sort({start: 1});

  for (const entry of unscheduledLinearEntries) {
    const exisingLinearChannel = await db.linear.findOne<ILinearChannel>({name: entry.network});

    if (!exisingLinearChannel) {
      continue;
    }

    const channelNum = exisingLinearChannel.channel + START_CHANNEL;
    const scheduleExists = await db.schedule.findOne<IChannel>({channel: channelNum});

    if (scheduleExists) {
      await db.schedule.update<IChannel>({_id: scheduleExists._id}, {$set: {endsAt: entry.end}});
    } else {
      await db.schedule.insert<IChannel>({
        channel: channelNum,
        endsAt: entry.end,
      });
    }

    await db.entries.update<IEntry>({_id: entry._id}, {$set: {channel: channelNum}});
  }
};

export const scheduleEntries = async (firstRun = true): Promise<void> => {
  let needReschedule = false;

  if (useLinear) {
    // eslint-disable-next-line object-shorthand
    await db.entries.update<IEntry>(
      {
        $where() {
          return isEventOnLinear(this);
        },
      },
      {$unset: {channel: true}},
      {multi: true},
    );

    if (firstRun) {
      // Remove linear channels that got added accidentally
      // eslint-disable-next-line object-shorthand
      const numRemoved = await db.linear.remove(
        {
          $where() {
            return isDigitalNetwork(this.name);
          },
        },
        {multi: true},
      );

      if (numRemoved > 0) {
        needReschedule = true;
        await db.linear.remove({}, {multi: true});
      }

      // Check to see if some digital events creeped into the linear channels
      const linearChannelNums = await db.linear.count({});
      const entriesInLinear = await db.entries.count({channel: {$lt: linearChannelNums + START_CHANNEL}});

      if (entriesInLinear > 0) {
        needReschedule = true;
      }

      // Check to see if linear channel schedules got added a million times
      if (linearChannelNums > 0) {
        for (let a = 0; a < linearChannelNums; a++) {
          const scheduleCount = await db.schedule.count({channel: a + START_CHANNEL});

          if (scheduleCount > 1) {
            needReschedule = true;
          }
        }
      }
    }
  } else {
    if (firstRun) {
      // Check to see if we're not using linear channels anymore
      const linearChannelNums = await db.linear.remove({}, {multi: true});

      if (linearChannelNums > 0) {
        needReschedule = true;
      }
    }
  }

  const unscheduledEntries = await db.entries.find<IEntry>({channel: {$exists: false}}).sort({start: 1});

  // eslint-disable-next-line object-shorthand
  const unscheduledRegularEntries = await db.entries.count({
    $and: [
      {
        $where() {
          return !isEventOnLinear(this);
        },
      },
      {channel: {$exists: false}},
    ],
  });

  unscheduledRegularEntries &&
    console.log(`Scheduling ${useLinear ? unscheduledRegularEntries : unscheduledEntries.length} entries...`);

  for (const entry of unscheduledEntries) {
    if (!useLinear) {
      await scheduleEntry(entry, START_CHANNEL);
    } else {
      // Normal entries
      if (!isEventOnLinear(entry)) {
        const linearChannelNums = await db.linear.count({});
        await scheduleEntry(entry, linearChannelNums + START_CHANNEL);
        // Linear entries
      } else {
        const exisingLinearChannel = await db.linear.findOne<ILinearChannel>({name: entry.network});

        if (!exisingLinearChannel) {
          needReschedule = true;

          const linearChannelNums = await db.linear.count({});

          await db.linear.insert<ILinearChannel>({
            channel: linearChannelNums,
            name: entry.network,
          });
        }
      }
    }
  }

  if (needReschedule) {
    console.log('******************************************************************************');
    console.log('**                                                                          **');
    console.log('** Need to rebuild the schedule because the USE_LINEAR variable has changed **');
    console.log('**                         or networks have changed                         **');
    console.log('**                                                                          **');
    console.log('******************************************************************************');
    console.log('**        THIS WILL BREAK SCHEDULED RECORDINGS IN YOUR DVR SOFTWARE         **');
    console.log('******************************************************************************');

    await db.entries.update<IEntry>({}, {$unset: {channel: true}}, {multi: true});
    await db.schedule.remove({}, {multi: true});

    return await scheduleEntries();
  }

  if (useLinear) {
    return await scheduleLinearEntries();
  }
};
