import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {VictoryBody} from './views/CardBody';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {victoryHandler, TVictoryTokens} from '@/services/victory-handler';

export const victory = new Hono().basePath('/victory');

const scheduleEvents = async () => {
  await victoryHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('victory');
};

victory.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['victory-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'victory'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

victory.put('/toggle-stars', async c => {
  const body = await c.req.parseBody();
  const stars = body['victory-stars-enabled'] === 'on';

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TVictoryTokens>, any>(
    {name: 'victory'},
    {$set: {meta: {ducks: false, stars}}},
    {returnUpdatedDocs: true},
  );
  const {enabled, tokens} = affectedDocuments as IProvider<TVictoryTokens>;
  scheduleEvents();

  return c.html(<VictoryBody enabled={enabled} tokens={tokens} />);
});

victory.put('/toggle-ducks', async c => {
  const body = await c.req.parseBody();
  const ducks = body['victory-ducks-enabled'] === 'on';

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TVictoryTokens>, any>(
    {name: 'victory'},
    {$set: {meta: {ducks, stars: false}}},
    {returnUpdatedDocs: true},
  );
  const {enabled, tokens} = affectedDocuments as IProvider<TVictoryTokens>;
  scheduleEvents();

  return c.html(<VictoryBody enabled={enabled} tokens={tokens} />);
});

victory.get('/auth/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await victoryHandler.authenticateRegCode(code);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TVictoryTokens>, any>(
    {name: 'victory'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TVictoryTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<VictoryBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Victory+"}}`,
  });
});

victory.put('/reauth', async c => {
  return c.html(<Login />);
});
