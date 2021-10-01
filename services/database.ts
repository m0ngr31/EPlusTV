import path from 'path';
import _ from 'lodash';
import fs from 'fs';
import database from 'a1-database';



class DataBase {
  public entries;
  public schedule;

  public async init() {
    this.entries = await database.get(path.join(process.cwd(), 'config/entries.db'));
    this.schedule = await database.get(path.join(process.cwd(), 'config/schedule.db'));
  }

  public async close() {
    await database.disconnect(this.entries);
    await database.disconnect(this.schedule);
  }
}

export const db = new DataBase();
