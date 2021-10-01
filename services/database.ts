import path from 'path';
import Datastore from 'nedb-promises';

export const db = {
  entries: Datastore.create(path.join(process.cwd(), 'config/entries.db')),
  schedule: Datastore.create(path.join(process.cwd(), 'config/schedule.db')),
};
