import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {nsicHandler} from '@/services/nsic-handler';

export const nsic = new Hono().basePath('/nsic');

const scheduleEvents = async () => {
  await nsicHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('northern-sun');
};

nsic.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['nsic-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'nsic'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Northern Sun"}}`,
    }),
  });
});
