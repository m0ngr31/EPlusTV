import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {FloSportsBody} from './views/CardBody';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {floSportsHandler, TFloSportsTokens} from '@/services/flo-handler';

export const flosports = new Hono().basePath('/flosports');

const scheduleEvents = async () => {
  await floSportsHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('flo');
};

flosports.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['flosports-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'flosports'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

flosports.get('/auth/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await floSportsHandler.authenticateRegCode(code);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TFloSportsTokens>, any>(
    {name: 'flosports'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TFloSportsTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<FloSportsBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled FloSports"}}`,
  });
});

flosports.put('/reauth', async c => {
  return c.html(<Login />);
});
