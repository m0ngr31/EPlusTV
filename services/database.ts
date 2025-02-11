import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';

import {configPath} from './config';

export const entriesDb = path.join(configPath, 'entries.db');
export const scheduleDb = path.join(configPath, 'schedule.db');
export const providersDb = path.join(configPath, 'providers.db');
export const miscDb = path.join(configPath, 'misc.db');

export interface IDocument {
  _id: string;
}

export const db = {
  entries: new Datastore({autoload: true, filename: entriesDb}),
  misc: new Datastore({autoload: true, filename: miscDb}),
  providers: new Datastore({autoload: true, filename: providersDb}),
  schedule: new Datastore({autoload: true, filename: scheduleDb}),
};

export const initializeEntries = (): void => fs.writeFileSync(entriesDb, '');
export const initializeSchedule = (): void => fs.writeFileSync(scheduleDb, '');
export const initializeProviders = (): void => fs.writeFileSync(providersDb, '');
export const initializeMisc = (): void => fs.writeFileSync(miscDb, '');
