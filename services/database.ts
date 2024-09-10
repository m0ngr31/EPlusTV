import fs from 'fs';
import path from 'path';
import Datastore from 'nedb-promises';

import {configPath} from './config';

export const entriesDb = path.join(configPath, 'entries.db');
export const scheduleDb = path.join(configPath, 'schedule.db');

export interface IDocument {
  _id: string;
}

export const db = {
  entries: Datastore.create(entriesDb),
  schedule: Datastore.create(scheduleDb),
};

export const initializeEntries = (): void => fs.writeFileSync(entriesDb, '');
export const initializeSchedule = (): void => fs.writeFileSync(scheduleDb, '');
