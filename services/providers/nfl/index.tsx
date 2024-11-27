import {Hono} from 'hono';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { nflHandler, TNFLTokens, TOtherAuth } from '@/services/nfl-handler';
import { getRandomHex } from '@/services/shared-helpers';

import { Login } from './views/Login';
import { NFLBody } from './views/CardBody';

export const nfl = new Hono().basePath('/nfl');

const scheduleEvents = async () => {
  await nflHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('nfl+');
};

nfl.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['nfl-enabled'] === 'on';

  if (!enabled) {
    await db.providers.update<IProvider>({name: 'nfl'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  return c.html(<Login />);
});

nfl.put('/auth/:provider', async c => {
  const provider = c.req.param('provider') as TOtherAuth;
  const body = await c.req.parseBody();
  const enabled = body[`nfl-${provider}-enabled`] === 'on';

  const {tokens} = await db.providers.findOne<IProvider<TNFLTokens>>({name: 'nfl'});

  const updatedTokens = {...tokens};

  if (!enabled) {
    switch (provider) {
      case 'peacock':
        delete updatedTokens.peacockUUID;
        delete updatedTokens.peacockUserId;
        break;
      case 'prime':
        delete updatedTokens.amazonPrimeUUID;
        delete updatedTokens.amazonPrimeUserId;
        break;
      case 'tve':
        delete updatedTokens.mvpdIdp;
        delete updatedTokens.mvpdUUID;
        delete updatedTokens.mvpdUserId;
        break;
      case 'sunday_ticket':
        delete updatedTokens.youTubeUUID;
        delete updatedTokens.youTubeUserId;
        break;
      case 'twitch':
        delete updatedTokens.twitchDeviceId;
        break;
    }
  } else {
    if (provider === 'twitch') {
      updatedTokens.twitchDeviceId = getRandomHex();
    }
  }

  if (!enabled || provider === 'twitch') {
    const {linear_channels, tokens} = await db.providers.update<IProvider<TNFLTokens>>({name: 'nfl'}, {$set: {tokens: updatedTokens}}, {returnUpdatedDocs: true});

    return c.html(<NFLBody channels={linear_channels} enabled={true} open={false} tokens={tokens} />);
  }

  return c.html(<Login otherAuth={provider} />);
});

nfl.get('/login/:code/:other', async c => {
  const code = c.req.param('code');
  const otherAuth = c.req.param('other');

  const provider = otherAuth === 'undefined' ? undefined : (otherAuth as TOtherAuth);

  const isAuthenticated = await nflHandler.authenticateRegCode(code, provider);

  if (!isAuthenticated) {
    return c.html(<Login code={code} otherAuth={provider} />);
  }

  const {tokens, linear_channels} = await db.providers.update<IProvider<TNFLTokens>>(
    {name: 'nfl'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );

  // Kickoff event scheduler
  scheduleEvents();

  const otherAuthName =
    otherAuth === 'tve'
      ? ' (TV Provider)'
      : otherAuth === 'prime'
      ? ' (Amazon Prime)'
      : otherAuth === 'peacock'
      ? ' (Peacock)'
      : otherAuth === 'sunday_ticket'
      ? ' (Youtube)'
      : otherAuth === 'twitch' ? ' (Twitch)' : '';

  const message = `NFL${otherAuthName}`;

  return c.html(<NFLBody enabled={true} tokens={tokens} open={true} channels={linear_channels} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ${message}"}}`,
  });
});

nfl.put('/reauth', async c => {
  return c.html(<Login />);
});

nfl.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOne<IProvider>({name: 'nfl'});

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
    await db.providers.update<IProvider>({name: 'nfl'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/nfl/channels/toggle/${channelId}`}
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
