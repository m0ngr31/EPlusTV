import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { espnHandler, IEspnPlusMeta, TESPNPlusTokens } from '@/services/espn-handler';
import { ESPNPlusBody } from './views/CardBody';

export const espnplus = new Hono().basePath('/espnplus');

const scheduleEvents = async () => {
  await espnHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('espn');
};

espnplus.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['espnplus-enabled'] === 'on';

  if (!enabled) {
    await db.providers.update<IProvider>({name: 'espnplus'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

espnplus.put('/toggle-ppv', async c => {
  const body = await c.req.parseBody();
  const use_ppv = body['espnplus-ppv-enabled'] === 'on';

  const {enabled, tokens} = await db.providers.update<IProvider<TESPNPlusTokens, IEspnPlusMeta>>(
    {name: 'espnplus'},
    {$set: {meta: {use_ppv}}},
    {returnUpdatedDocs: true},
  );

  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={enabled} tokens={tokens} />);
});

espnplus.get('/login/check', async c => {
  const isAuthenticated = await espnHandler.authenticatePlusRegCode();

  if (!isAuthenticated) {
    return c.html(<Login />);
  }

  const {tokens} = await db.providers.update<IProvider<TESPNPlusTokens>>({name: 'espnplus'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ESPN+"}}`,
  });
});

espnplus.put('/reauth', async c => {
  return c.html(<Login />);
});
