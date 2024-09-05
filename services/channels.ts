import _ from 'lodash';

let startChannel = _.toNumber(process.env.START_CHANNEL);
if (_.isNaN(startChannel)) {
  startChannel = 1;
}

let numOfChannels = _.toNumber(process.env.NUM_OF_CHANNELS);
if (_.isNaN(numOfChannels)) {
  numOfChannels = 200;
}

export const START_CHANNEL = startChannel;
export const NUM_OF_CHANNELS = numOfChannels;
