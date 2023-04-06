import path from 'path';
import fs from 'fs';

import {configPath} from './config';
import {initializeEntries, initializeSchedule, initializeLinear} from './database';

export const initDirectories = (): void => {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath);
  }

  if (!fs.existsSync(path.join(configPath, 'entries.db'))) {
    initializeEntries();
  }

  if (!fs.existsSync(path.join(configPath, 'schedule.db'))) {
    initializeSchedule();
  }

  if (!fs.existsSync(path.join(configPath, 'linear.db'))) {
    initializeLinear();
  }
};
