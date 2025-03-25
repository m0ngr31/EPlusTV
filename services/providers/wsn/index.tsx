import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {wsnHandler} from '@/services/wsn-handler';

export const wsn = new Hono().basePath('/wsn');

const scheduleEvents = async () => {
  await wsnHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('wsn');
};

wsn.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['wsn-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'wsn'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Women's Sports Network"}}`,
    }),
  });
});
