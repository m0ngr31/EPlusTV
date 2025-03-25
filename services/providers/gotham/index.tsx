import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {TVELogin} from './views/TveLogin';
import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {gothamHandler, TGothamTokens} from '@/services/gotham-handler';
import {GothamBody} from './views/CardBody';

export const gotham = new Hono().basePath('/gotham');

const scheduleEvents = async () => {
  await gothamHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('gotham');
};

gotham.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['gotham-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'gotham'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

gotham.post('/login', async c => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  const isAuthenticated = await gothamHandler.login(username, password);

  if (!isAuthenticated) {
    return c.html(<Login invalid={true} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TGothamTokens>, any>(
    {name: 'gotham'},
    {
      $set: {
        enabled: true,
        meta: {
          password,
          username,
        },
      },
    },
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TGothamTokens>;

  const channels = await gothamHandler.getLinearChannels();

  const linear_channels = [];

  for (const channel of Object.values(channels)) {
    linear_channels.push({
      id: channel.id,
      name: channel.name,
    });
  }

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<GothamBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Gotham Sports"}}`,
  });
});

gotham.put('/auth/tve', async c => {
  const body = await c.req.parseBody();
  const enabled = body[`gotham-tve-enabled`] === 'on';

  const {tokens} = await db.providers.findOneAsync<IProvider<TGothamTokens>>({name: 'gotham'});

  const updatedTokens = {...tokens};

  if (!enabled) {
    delete updatedTokens.adobe_token;
    delete updatedTokens.adobe_token_expires;

    const {affectedDocuments} = await db.providers.updateAsync<IProvider<TGothamTokens>, any>(
      {name: 'gotham'},
      {$set: {tokens: updatedTokens}},
      {returnUpdatedDocs: true},
    );
    const {tokens} = affectedDocuments as IProvider<TGothamTokens>;

    const channels = await gothamHandler.getLinearChannels();

    const linear_channels = [];

    for (const channel of Object.values(channels)) {
      linear_channels.push({
        id: channel.id,
        name: channel.name,
      });
    }

    return c.html(<GothamBody channels={linear_channels} enabled={true} open={false} tokens={tokens} />);
  }

  return c.html(<TVELogin />);
});

gotham.get('/tve-login/:link', async c => {
  const link = c.req.param('link');

  const isAuthenticated = await gothamHandler.authenticateRegCode();

  if (!isAuthenticated) {
    return c.html(<TVELogin link={link} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TGothamTokens>, any>(
    {name: 'gotham'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TGothamTokens>;

  const channels = await gothamHandler.getLinearChannels();

  const linear_channels = [];

  for (const channel of Object.values(channels)) {
    linear_channels.push({
      id: channel.id,
      name: channel.name,
    });
  }

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<GothamBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully authenticated TVE Provider for Gotham"}}`,
  });
});

gotham.put('/reauth', async c => {
  return c.html(<Login />);
});
