import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {NwslBody} from './views/CardBody';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {nwslHandler, TNwslTokens} from '@/services/nwsl-handler';

export const nwsl = new Hono().basePath('/nwsl');

const scheduleEvents = async () => {
  await nwslHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('nwsl+');
};

nwsl.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['nwsl-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider<TNwslTokens>, any>({name: 'nwsl'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

nwsl.post('/login', async c => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  const isAuthenticated = await nwslHandler.login(username, password);

  if (!isAuthenticated) {
    return c.html(<Login invalid={true} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TNwslTokens>, any>(
    {name: 'nwsl'},
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
  const {tokens, linear_channels} = affectedDocuments as IProvider<TNwslTokens>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<NwslBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled NWSL+"}}`,
  });
});

nwsl.put('/reauth', async c => {
  return c.html(<Login />);
});

nwsl.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'nwsl'});

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
    await db.providers.updateAsync<IProvider, any>({name: 'nwsl'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/nwsl/channels/toggle/${channelId}`}
        hx-trigger="change"
        name="channel-enabled"
      />,
      200,
      {
        ...(enabled && {
          'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ${updatedChannel}"}}`,
        }),
      },
    );
  }
});
