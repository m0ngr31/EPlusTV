import {Hono} from 'hono';

import { db } from '@/services/database';

import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { mwHandler } from '@/services/mw-handler';

export const mw = new Hono().basePath('/mw');

const scheduleEvents = async () => {
  await mwHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('mountain-west');
};

mw.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['mw-enabled'] === 'on';

  await db.providers.update<IProvider>({name: 'mw'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Mountain West"}}`,
    })
  });
});
