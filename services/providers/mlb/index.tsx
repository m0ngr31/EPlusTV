import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { MlbBody } from './views/CardBody';

import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { mlbHandler, TMLBTokens } from '@/services/mlb-handler';

export const mlbtv = new Hono().basePath('/mlbtv');

const scheduleEvents = async () => {
  await mlbHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('mlbtv');
};

mlbtv.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['mlbtv-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'mlbtv'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

mlbtv.put('/toggle-free', async c => {
  const body = await c.req.parseBody();
  const onlyFree = body['mlbtv-onlyfree-enabled'] === 'on';

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TMLBTokens>, any>(
    {name: 'mlbtv'},
    {$set: {meta: {onlyFree}}},
    {returnUpdatedDocs: true},
  );
  const {enabled, tokens, linear_channels} = affectedDocuments as IProvider<TMLBTokens>;
  scheduleEvents();

  return c.html(<MlbBody enabled={enabled} tokens={tokens} channels={linear_channels} />);
});

mlbtv.get('/auth/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await mlbHandler.authenticateRegCode();

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TMLBTokens>, any>(
    {name: 'mlbtv'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens, linear_channels} = affectedDocuments as IProvider<TMLBTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<MlbBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled MLB.tv"}}`,
  });
});

mlbtv.put('/reauth', async c => {
  return c.html(<Login />);
});

mlbtv.put('/mlbn-access', async c => {
  const {linear_channels: originalChannels} = await db.providers.findOneAsync<IProvider>({name: 'mlbtv'});
  const updatedValue = await mlbHandler.recheckMlbNetworkAccess();

  if (updatedValue && !originalChannels[0].enabled) {
    await mlbHandler.getSchedule();
    await scheduleEntries();
  }

  const {enabled, tokens, linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'mlbtv'});

  return c.html(<MlbBody enabled={enabled} tokens={tokens} channels={linear_channels} />);
});
