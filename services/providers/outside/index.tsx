import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {outsideHandler, TOutsideTokens} from '@/services/outside-handler';
import {OutsideBody} from './views/CardBody';

export const outside = new Hono().basePath('/outside');

const scheduleEvents = async () => {
  await outsideHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('outside');
};

outside.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['outside-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'outside'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

outside.get('/tve-login/:code/:loginLink/:checkLink', async c => {
  const code = c.req.param('code');
  const loginLink = c.req.param('loginLink');
  const checkLink = c.req.param('checkLink');

  const isAuthenticated = await outsideHandler.authenticateRegCode(checkLink);

  if (!isAuthenticated) {
    return c.html(<Login code={code} loginLink={loginLink} checkLink={checkLink} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TOutsideTokens>, any>(
    {name: 'outside'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens, linear_channels} = affectedDocuments as IProvider<TOutsideTokens>;
  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<OutsideBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Outside TV"}}`,
  });
});

outside.put('/reauth', async c => {
  return c.html(<Login />);
});

outside.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'outside'});

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
    await db.providers.updateAsync<IProvider, any>({name: 'outside'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/outside/channels/toggle/${channelId}`}
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
