import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import _ from 'lodash';

export const tmpPath = path.join(process.cwd(), 'tmp/eplustv');
const configPath = path.join(process.cwd(), 'config');

export const initDirectories = (numChannels, startChannel) => {
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, {recursive: true});
  }

  fsExtra.emptyDirSync(tmpPath);

  _.times(numChannels, i => {
    const channelPath = path.join(tmpPath, `${i + startChannel}`);
    fs.mkdirSync(channelPath);
  });

  if (!fs.existsSync(path.join(configPath, 'state.json'))) {
    fs.writeFileSync(path.join(configPath, 'state.json'), JSON.stringify({}));
  }

  if (!fs.existsSync(path.join(configPath, 'entries.db'))) {
    fs.writeFileSync(path.join(configPath, 'entries.db'), '');
  }

  if (!fs.existsSync(path.join(configPath, 'schedule.db'))) {
    fs.writeFileSync(path.join(configPath, 'schedule.db'), '');
  }
};

