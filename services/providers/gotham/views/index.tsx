import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { TGothamTokens } from '@/services/gotham-handler';

import { GothamBody } from './CardBody';

export const Gotham: FC = async () => {
  const gotham = await db.providers.findOne<IProvider<TGothamTokens>>({name: 'gotham'});
  const enabled = gotham?.enabled;
  const tokens = gotham?.tokens;
  const channels = gotham?.linear_channels || [];

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Gotham</h4>
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
          <GothamBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
