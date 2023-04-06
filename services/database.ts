import fs from 'fs';
import path from 'path';
import Datastore from 'nedb-promises';

import {configPath} from './config';

export interface IDocument {
  _id: string;
}

export const db = {
  entries: Datastore.create(path.join(process.cwd(), 'config/entries.db')),
  linear: Datastore.create(path.join(process.cwd(), 'config/linear.db')),
  schedule: Datastore.create(path.join(process.cwd(), 'config/schedule.db')),
};

export const initializeEntries = (): void => fs.writeFileSync(path.join(configPath, 'entries.db'), '');
export const initializeSchedule = (): void => fs.writeFileSync(path.join(configPath, 'schedule.db'), '');
export const initializeLinear = (): void => fs.writeFileSync(path.join(configPath, 'linear.db'), '');
