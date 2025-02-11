import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { paramountHandler, TParamountTokens } from '@/services/paramount-handler';
import { ParamountBody } from './views/CardBody';

export const paramount = new Hono().basePath('/paramount');

const scheduleEvents = async () => {
  await paramountHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('paramount+');
};

paramount.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['paramount-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'paramount'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

paramount.get('/tve-login/:code/:token', async c => {
  const code = c.req.param('code');
  const token = c.req.param('token');

  const isAuthenticated = await paramountHandler.authenticateRegCode(code, token);

  if (!isAuthenticated) {
    return c.html(<Login code={code} deviceToken={token} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TParamountTokens>, any>({name: 'paramount'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});
  const {tokens, linear_channels} = affectedDocuments as IProvider<TParamountTokens>;
  // Kickoff event scheduler
  scheduleEvents();

  return c.html(
    <ParamountBody
      enabled={true}
      tokens={tokens}
      open={true}
      channels={linear_channels}
    />,
    200,
    {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Paramount+"}}`,
    },
  );
});

paramount.put('/reauth', async c => {
  return c.html(<Login />);
});

paramount.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'paramount'});

  const body = await c.req.parseBody();
  const enabled = body['channel-enabled'] === 'on';

  let updatedChannel = channelId;

  const updatedChannels = linear_channels.map(channel => {
    if (channel.id === channelId) {
      updatedChannel = channel.name;
      return {...channel, enabled: !channel.enabled};
    }
    return channel;
  });

  if (updatedChannel !== channelId) {
    await db.providers.updateAsync<IProvider, any>({name: 'paramount'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/paramount/channels/toggle/${channelId}`}
        hx-trigger="change"
        name="channel-enabled"
      />,
      200,
      {
        ...(enabled && {
          'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ${updatedChannel}"}}`,
        })
      },
    );
  }
});
