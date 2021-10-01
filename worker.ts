// Gets and set schedules for the channels

import { scheduleEntries } from './services/build-schedule';
import { db } from './services/database';
import { getEventSchedules } from './services/get-events';

if (!process.env.ESPN_USER || !process.env.ESPN_PASS) {
  console.log('Username and password need to be set!');
  process.exit();
}

const schedule = async () => {
  await db.init();

  console.log('=== Getting events ===');
  await getEventSchedules();
  console.log('=== Done getting events ===');
  console.log('=== Building the schedule ===');
  await scheduleEntries();
  console.log('=== Done building the schedule ===');

  await db.close();
};

(async () => {
  await schedule();
})();

// Check for events every 4 hours and set the schedule
setInterval(async () => {
  await schedule();
}, 1000 * 60 * 60 * 4);

const shutDown = () => {
  try {
    db.close();
  } catch (e) {}

  process.exit(0);
};

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
