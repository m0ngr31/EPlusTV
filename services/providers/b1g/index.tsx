import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {B1GBody} from './views/CardBody';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {b1gHandler, TB1GTokens} from '@/services/b1g-handler';

export const b1g = new Hono().basePath('/b1g');

const scheduleEvents = async () => {
  await b1gHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('b1g+');
};

b1g.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['b1g-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider<TB1GTokens>, any>({name: 'b1g'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

b1g.post('/login', async c => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  const isAuthenticated = await b1gHandler.login(username, password);

  if (!isAuthenticated) {
    return c.html(<Login invalid={true} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TB1GTokens>, any>(
    {name: 'b1g'},
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
  const {tokens} = affectedDocuments as IProvider<TB1GTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<B1GBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled B1G+"}}`,
  });
});

b1g.put('/reauth', async c => {
  return c.html(<Login />);
});
