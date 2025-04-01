import {Hono} from 'hono';

import {db} from '@/services/database';

import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {ballyHandler} from '@/services/bally-handler';

export const bally = new Hono().basePath('/bally');

const scheduleEvents = async () => {
  await ballyHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('bally');
};

bally.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['bally-enabled'] === 'on';

  await db.providers.updateAsync<IProvider, any>({name: 'bally'}, {$set: {enabled}});

  if (enabled) {
    scheduleEvents();
  } else {
    removeEvents();
  }

  return c.html(<></>, 200, {
    ...(enabled && {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled Bally Sports"}}`,
    }),
  });
});

bally.put('/channels/toggle/:id', async c => {
  const channelId = c.req.param('id');
  const {linear_channels} = await db.providers.findOneAsync<IProvider>({name: 'bally'});

  const body = await c.req.parseBody();
  const enabled = body['channel-enabled'] === 'on';

  let updatedChannel = channelId;

  const updatedChannels = linear_channels.map(channel => {
    if (channel.id === channelId) {
      updatedChannel = 'zzzzzzz';
      return {...channel, enabled: !channel.enabled};
    }
    return channel;
  });

  if (updatedChannel !== channelId) {
    await db.providers.updateAsync<IProvider, any>({name: 'bally'}, {$set: {linear_channels: updatedChannels}});

    // Kickoff event scheduler
    scheduleEvents();

    return c.html(
      <input
        hx-target="this"
        hx-swap="outerHTML"
        type="checkbox"
        checked={enabled ? true : false}
        data-enabled={enabled ? 'true' : 'false'}
        hx-put={`/providers/bally/channels/toggle/${channelId}`}
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
