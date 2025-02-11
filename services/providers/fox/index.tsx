import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { foxHandler, TFoxTokens } from '@/services/fox-handler';
import { FoxBody } from './views/CardBody';

export const fox = new Hono().basePath('/fox');

const scheduleEvents = async () => {
  await foxHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('foxsports');
};

const removeAndSchedule = async () => {
  await removeEvents();
  await scheduleEvents();
};

fox.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['fox-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'foxsports'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

fox.put('/toggle-4k-only', async c => {
  const body = await c.req.parseBody();
  const only4k = body['fox-enabled-4k-only'] === 'on';

  const {meta} = await db.providers.findOneAsync<IProvider>({name: 'foxsports'});

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TFoxTokens>, any>(
    {name: 'foxsports'},
    {
      $set: {
        meta: {
          ...meta,
          only4k,
        },
      },
    },
    {
      returnUpdatedDocs: true,
    },
  );
  const {enabled, tokens, linear_channels} = affectedDocuments as IProvider<TFoxTokens>;

  removeAndSchedule();

  return c.html(<FoxBody enabled={enabled} tokens={tokens} channels={linear_channels} />);
});

fox.put('/toggle-uhd', async c => {
  const body = await c.req.parseBody();
  const uhd = body['fox-enabled-uhd'] === 'on';

  const {meta} = await db.providers.findOneAsync<IProvider>({name: 'foxsports'});

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TFoxTokens>, any>(
    {name: 'foxsports'},
    {
      $set: {
        meta: {
          ...meta,
          uhd,
        },
      },
    },
    {
      returnUpdatedDocs: true,
    },
  );
  const {enabled, tokens, linear_channels} = affectedDocuments as IProvider<TFoxTokens>;

  return c.html(<FoxBody enabled={enabled} tokens={tokens} channels={linear_channels} />);
});

fox.get('/tve-login/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await foxHandler.authenticateRegCode(false);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TFoxTokens>, any>({name: 'foxsports'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});
  const {tokens, linear_channels} = affectedDocuments as IProvider<TFoxTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<FoxBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Fox Sports"}}`,
  });
});

fox.put('/reauth', async c => {
  return c.html(<Login />);
});
