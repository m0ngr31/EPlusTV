import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {gothamHandler, TGothamTokens} from '@/services/gotham-handler';

import {GothamBody} from './CardBody';

export const Gotham: FC = async () => {
  const gotham = await db.providers.findOneAsync<IProvider<TGothamTokens>>({name: 'gotham'});
  const enabled = gotham?.enabled;
  const tokens = gotham?.tokens;

  const channels = await gothamHandler.getLinearChannels();

  const linear_channels = [];

  for (const channel of Object.values(channels)) {
    linear_channels.push({
      id: channel.id,
      name: channel.name,
    });
  }

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Gotham Sports</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/gotham/toggle`}
                hx-trigger="change"
                hx-target="#gotham-body"
                name="gotham-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="gotham-body" hx-swap="innerHTML">
          <GothamBody enabled={enabled} tokens={tokens} channels={linear_channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
