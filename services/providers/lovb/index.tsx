import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {lovbHandler} from '@/services/lovb-handler';

export const lovb = new Hono().basePath('/lovb');

const scheduleEvents = async () => {
  await lovbHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('lovb');
};

lovb.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['lovb-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'lovb'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled LOVB"}}`,
    }),
  });
});
