import _ from 'lodash';

import {db} from './database';
import {IMiscDbEntry} from './shared-interfaces';

const BUFFER_CHANNELS = 50;

const linearChannelsEnv = process.env.LINEAR_CHANNELS?.toLowerCase();
const startChannelEnv = process.env.START_CHANNEL;
const numOfChannelsEnv = process.env.NUM_OF_CHANNELS;
const proxySegmentsEnv = process.env.PROXY_SEGMENTS?.toLowerCase();

const nextStartChannel = (end: number, buffer: number): number => {
  const sum = end + buffer;

  // Round up to the next hundred
  let nextHundred = Math.ceil(sum / 100) * 100;

  // Check if the result is at least 50 more than X
  if (nextHundred - end < buffer) {
    nextHundred += 100;
  }

  return nextHundred;
};

export const initMiscDb = async (): Promise<void> => {
  const setupLinear = (await db.misc.countAsync({name: 'use_linear'})) > 0 ? true : false;

  if (!setupLinear) {
    await db.misc.insertAsync<IMiscDbEntry<boolean>>({
      name: 'use_linear',
      value: linearChannelsEnv === 'true' ? true : false,
    });
  }

  const setupStartChannel = (await db.misc.countAsync({name: 'start_channel'})) > 0 ? true : false;

  if (!setupStartChannel) {
    let startChannel = _.toNumber(startChannelEnv);

    if (_.isNaN(startChannel)) {
      startChannel = 1;
    }

    await db.misc.insertAsync<IMiscDbEntry<number>>({
      name: 'start_channel',
      value: startChannel,
    });
  }

  const setupNumOfChannels = (await db.misc.countAsync({name: 'num_channels'})) > 0 ? true : false;

  if (!setupNumOfChannels) {
    let numOfChannels = _.toNumber(numOfChannelsEnv);

    if (_.isNaN(numOfChannels)) {
      numOfChannels = 200;
    }

    await db.misc.insertAsync<IMiscDbEntry<number>>({
      name: 'num_channels',
      value: numOfChannels,
    });
  }

  const setupLinearStartChannel = (await db.misc.countAsync({name: 'linear_start_channel'})) > 0 ? true : false;

  if (!setupLinearStartChannel) {
    const startChannel = await getStartChannel();
    const numOfChannels = await getNumberOfChannels();

    await db.misc.insertAsync<IMiscDbEntry<number>>({
      name: 'linear_start_channel',
      value: nextStartChannel(startChannel + numOfChannels, BUFFER_CHANNELS),
    });
  }

  const setupProxySegments = (await db.misc.countAsync({name: 'proxy_segments'})) > 0 ? true : false;

  if (!setupProxySegments) {
    await db.misc.insertAsync<IMiscDbEntry<boolean>>({
      name: 'proxy_segments',
      value: proxySegmentsEnv === 'true' ? true : false,
    });
  }

  const setupXmltvPadding = (await db.misc.countAsync({name: 'xmltv_padding'})) > 0 ? true : false;

  if (!setupXmltvPadding) {
    await db.misc.insertAsync<IMiscDbEntry<boolean>>({
      name: 'xmltv_padding',
      value: true,
    });
  }

  if (linearChannelsEnv) {
    console.log('Using LINEAR_CHANNELS variable is no longer needed. Please use the UI going forward');
  }
  if (startChannelEnv) {
    console.log('Using START_CHANNEL variable is no longer needed. Please use the UI going forward');
  }
  if (numOfChannelsEnv) {
    console.log('Using NUM_OF_CHANNELS variable is no longer needed. Please use the UI going forward');
  }
  if (proxySegmentsEnv) {
    console.log('Using PROXY_SEGMENTS variable is no longer needed. Please use the UI going forward');
  }
};

export const usesLinear = async (): Promise<boolean> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<boolean>>({name: 'use_linear'});

  return value;
};

export const setLinear = async (value: boolean): Promise<number> =>
  (await db.misc.updateAsync<IMiscDbEntry<boolean>, any>({name: 'use_linear'}, {$set: {value}})).numAffected;

export const getStartChannel = async (): Promise<number> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<number>>({name: 'start_channel'});

  return value;
};

export const setStartChannel = async (channelNum: number): Promise<number> =>
  (await db.misc.updateAsync({name: 'start_channel'}, {$set: {value: channelNum}})).numAffected;

export const getLinearStartChannel = async (): Promise<number> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<number>>({name: 'linear_start_channel'});

  return value;
};

export const resetLinearStartChannel = async (): Promise<void> => {
  const startChannel = await getStartChannel();
  const numOfChannels = await getNumberOfChannels();

  await db.misc.updateAsync<IMiscDbEntry<number>, any>(
    {
      name: 'linear_start_channel',
    },
    {
      $set: {
        value: nextStartChannel(startChannel + numOfChannels, BUFFER_CHANNELS),
      },
    },
  );
};

export const getNumberOfChannels = async (): Promise<number> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<number>>({name: 'num_channels'});

  return value;
};

export const setNumberofChannels = async (numChannels: number): Promise<number> =>
  (await db.misc.updateAsync({name: 'num_channels'}, {$set: {value: numChannels}})).numAffected;

export const proxySegments = async (): Promise<boolean> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<boolean>>({name: 'proxy_segments'});

  return value;
};

export const setProxySegments = async (value: boolean): Promise<number> =>
  (await db.misc.updateAsync({name: 'proxy_segments'}, {$set: {value}})).numAffected;

export const xmltvPadding = async (): Promise<boolean> => {
  const {value} = await db.misc.findOneAsync<IMiscDbEntry<boolean>>({name: 'xmltv_padding'});

  return value;
};

export const setXmltvPadding = async (value: boolean): Promise<number> =>
  (await db.misc.updateAsync({name: 'xmltv_padding'}, {$set: {value}})).numAffected;
