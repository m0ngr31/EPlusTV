import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {kboHandler} from '@/services/kbo-handler';

export const kbo = new Hono().basePath('/kbo');

const scheduleEvents = async () => {
  await kboHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('kbo');
};

kbo.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['kbo-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'kbo'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    await db.providers.updateAsync({name: 'kbo'}, {$set: {'meta.client_id': ''}});
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled KBO"}}`,
    }),
  });
});
