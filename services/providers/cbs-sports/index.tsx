import {Hono} from 'hono';

import { Login } from './views/Login';
import { CBSBody } from './views/CardBody';

import { db } from '@/services/database';
import { cbsHandler, TCBSTokens } from '@/services/cbs-handler';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';

export const cbs = new Hono().basePath('/cbs');

const scheduleEvents = async () => {
  await cbsHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('cbssports');
};

cbs.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['cbs-enabled'] === 'on';

  if (!enabled) {
    await db.providers.update<IProvider>({name: 'cbs'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(
    <Login />
  );
});

cbs.get('/tve-login/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await cbsHandler.authenticateRegCode(code);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {tokens} = await db.providers.update<IProvider<TCBSTokens>>({name: 'cbs'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<CBSBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled CBS Sports"}}`,
  });
});

cbs.put('/reauth', async c => {
  return c.html(<Login />);
});
