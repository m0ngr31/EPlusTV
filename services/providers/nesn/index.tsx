import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {nesnHandler, TNesnTokens} from '@/services/nesn-handler';
import {NesnBody} from './views/CardBody';

export const nesn = new Hono().basePath('/nesn');

const scheduleEvents = async () => {
  await nesnHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('nesn+');
};

nesn.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['nesn-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider<TNesnTokens>, any>({name: 'nesn'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

nesn.get('/tve-login/:code/:token/:hashedurl', async c => {
  const code = c.req.param('code');
  const adobeToken = c.req.param('token');
  const url = c.req.param('hashedurl');

  const decodedUrl = Buffer.from(url, 'base64').toString();

  const isAuthenticated = await nesnHandler.authenticateRegCode(code, adobeToken);

  if (!isAuthenticated) {
    return c.html(<Login code={code} adobeCode={adobeToken} url={decodedUrl} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TNesnTokens>, any>(
    {name: 'nesn'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens, linear_channels} = affectedDocuments as IProvider<TNesnTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<NesnBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled NESN"}}`,
  });
});

nesn.put('/reauth', async c => {
  return c.html(<Login />);
});
