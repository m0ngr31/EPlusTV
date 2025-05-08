import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {WNBABody} from './views/CardBody';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {wnbaHandler, TWNBATokens} from '@/services/wnba-handler';

export const wnba = new Hono().basePath('/wnba');

const scheduleEvents = async () => {
  await wnbaHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('wnba+');
};

wnba.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['wnba-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider<TWNBATokens>, any>({name: 'wnba'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

wnba.post('/login', async c => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  const isAuthenticated = await wnbaHandler.login(username, password);

  if (!isAuthenticated) {
    return c.html(<Login invalid={true} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TWNBATokens>, any>(
    {name: 'wnba'},
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

  const {tokens} = affectedDocuments as IProvider<TWNBATokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<WNBABody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled WNBA League Pass"}}`,
  });
});

wnba.put('/reauth', async c => {
  return c.html(<Login />);
});
