import path from 'path';
import _ from 'lodash';
import fs from 'fs';
import database from 'a1-database';

import { generateRandom } from './generate-random';


/**
 * There is some serious monkey business going on in here. I should have just used mongo...
 *
 * Since a1-database isn't thread-safe, I am copying the databases to temporary files to avoid collisions.
 */
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

  public async initCopy() {
    const hash = generateRandom();

    if (fs.existsSync(path.join(process.cwd(), `config/entries.${hash}.db`))) {
      fs.rmSync(path.join(process.cwd(), `config/entries.${hash}.db`));
    }

    if (fs.existsSync(path.join(process.cwd(), `config/schedule.${hash}.db`))) {
      fs.rmSync(path.join(process.cwd(), `config/schedule.${hash}.db`));
    }

    if (fs.existsSync(path.join(process.cwd(), 'config/entries.db'))) {
      fs.copyFileSync(path.join(process.cwd(), 'config/entries.db'), path.join(process.cwd(), `config/entries.${hash}.db`));
    }

    if (fs.existsSync(path.join(process.cwd(), 'config/schedule.db'))) {
      fs.copyFileSync(path.join(process.cwd(), 'config/schedule.db'), path.join(process.cwd(), `config/schedule.${hash}.db`));
    }

    const entriesCopyDb = await database.get(path.join(process.cwd(), `config/entries.${hash}.db`));
    const scheduleCopyDb = await database.get(path.join(process.cwd(), `config/schedule.${hash}.db`));

    return [entriesCopyDb, scheduleCopyDb, hash];
  }

  public async closeCopy(entries, schedule, hash) {
    try {
      await database.disconnect(entries);
      await database.disconnect(schedule);
    } catch (e) {}

    if (fs.existsSync(path.join(process.cwd(), `config/entries.${hash}.db`))) {
      fs.rmSync(path.join(process.cwd(), `config/entries.${hash}.db`));
    }

    if (fs.existsSync(path.join(process.cwd(), `config/schedule.${hash}.db`))) {
      fs.rmSync(path.join(process.cwd(), `config/schedule.${hash}.db`));
    }
  }
}

export const db = new DataBase();
