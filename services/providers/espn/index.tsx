import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { espnHandler, IEspnMeta, TESPNTokens } from '@/services/espn-handler';
import { ESPNBody } from './views/CardBody';

export const espn = new Hono().basePath('/espn');

const scheduleEvents = async () => {
  await espnHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('espn');
};

espn.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['espn-enabled'] === 'on';

  if (!enabled) {
    await db.providers.update<IProvider>({name: 'espn'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

espn.get('/tve-login/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await espnHandler.authenticateLinearRegCode(code);

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {tokens, linear_channels, meta} = await db.providers.update<IProvider<TESPNTokens, IEspnMeta>>({name: 'espn'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<ESPNBody enabled={true} tokens={tokens} open={true} channels={linear_channels} meta={meta} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ESPN"}}`,
  });
});

espn.put('/reauth', async c => {
  return c.html(<Login />);
});

espn.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOne<IProvider>({name: 'espn'});

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
    await db.providers.update<IProvider>({name: 'espn'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/espn/channels/toggle/${channelId}`}
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

espn.put('/features/toggle/:id', async c => {
  const featureId = c.req.param('id');
  const {meta} = await db.providers.findOne<IProvider<any, IEspnMeta>>({name: 'espn'});

  const body = await c.req.parseBody();
  const enabled = body['channel-enabled'] === 'on';

  const featureMap = {
    accnx: 'ACC Network Extra',
    espn3: 'ESPN3',
    sec_plus: 'SEC Network+',
  };

  await db.providers.update<IProvider>({name: 'espn'}, {$set: {meta: {
    ...meta,
    [featureId]: enabled,
  }}});

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(
    <input
      hx-target="this"
      hx-swap="outerHTML"
      type="checkbox"
      checked={enabled ? true : false}
      data-enabled={enabled ? 'true' : 'false'}
      hx-put={`/providers/espn/features/toggle/${featureId}`}
      hx-trigger="change"
      name="channel-enabled"
    />,
    200,
    {
      ...(enabled && {
        'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ${featureMap[featureId]}"}}`,
      }),
    },
  );
});
