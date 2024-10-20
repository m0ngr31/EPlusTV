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
  await removeEntriesProvider('mlbtvtv');
};

mlbtv.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['mlbtv-enabled'] === 'on';

  if (!enabled) {
    await db.providers.update<IProvider>({name: 'mlbtv'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

mlbtv.put('/toggle-free', async c => {
  const body = await c.req.parseBody();
  const onlyFree = body['mlbtv-onlyfree-enabled'] === 'on';

  const {enabled, tokens, linear_channels} = await db.providers.update<IProvider>({name: 'mlbtv'}, {$set: {meta: {onlyFree}}}, {returnUpdatedDocs: true});

  scheduleEvents();

  return c.html(<MlbBody enabled={enabled} tokens={tokens} channels={linear_channels} onlyFree={onlyFree} />);
});

mlbtv.get('/auth/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await mlbHandler.authenticateRegCode();

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {tokens, linear_channels, meta} = await db.providers.update<IProvider<TMLBTokens>>(
    {name: 'mlbtv'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<MlbBody enabled={true} tokens={tokens} open={true} channels={linear_channels} onlyFree={meta.onlyFree} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled MLB.tv"}}`,
  });
});

mlbtv.put('/reauth', async c => {
  return c.html(<Login />);
});

mlbtv.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOne<IProvider>({name: 'mlbtv'});

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
    await db.providers.update<IProvider>({name: 'mlbtv'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/mlb/channels/toggle/${channelId}`}
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
