import fs from 'fs';

import {configPath} from './config';
import {
  entriesDb,
  initializeEntries,
  initializeSchedule,
  scheduleDb,
  initializeProviders,
  providersDb,
} from './database';
import {debug, debugPath} from './debug';

export const initDirectories = (): void => {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath);
  }

  if (debug.enabled && !fs.existsSync(debugPath)) {
    fs.mkdirSync(debugPath);
  }

  if (!fs.existsSync(entriesDb)) {
    initializeEntries();
  }

  if (!fs.existsSync(scheduleDb)) {
    initializeSchedule();
  }

  if (!fs.existsSync(providersDb)) {
    initializeProviders();
  }
};
