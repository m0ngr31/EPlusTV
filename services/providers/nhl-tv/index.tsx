import {Hono} from 'hono';

import {Login} from './views/Login';
import {NHLBody} from './views/CardBody';

import {db} from '@/services/database';
import {nhlHandler, TNHLTokens} from '@/services/nhltv-handler';
import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';

export const nhl = new Hono().basePath('/nhl');

const scheduleEvents = async () => {
  await nhlHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('nhl');
};

nhl.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['nhl-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'nhl'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

nhl.get('/login/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await nhlHandler.authenticateRegCode(code);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TNHLTokens>, any>(
    {name: 'nhl'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TNHLTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<NHLBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled NHL Sports"}}`,
  });
});

nhl.put('/reauth', async c => {
  return c.html(<Login />);
});
