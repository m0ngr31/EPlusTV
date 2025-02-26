import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {pwhlHandler} from '@/services/pwhl-handler';

export const pwhl = new Hono().basePath('/pwhl');

const scheduleEvents = async () => {
  await pwhlHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('pwhl');
};

pwhl.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['pwhl-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'pwhl'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled PWHL"}}`,
    }),
  });
});
