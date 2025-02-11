import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { TNesnTokens } from '@/services/nesn-handler';

import { NesnBody } from './CardBody';

export const Nesn: FC = async () => {
  const nesn = await db.providers.findOneAsync<IProvider<TNesnTokens>>({name: 'nesn'});
  const enabled = nesn?.enabled;
  const tokens = nesn?.tokens;
  const channels = nesn?.linear_channels || [];

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>NESN</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/nesn/toggle`}
                hx-trigger="change"
                hx-target="#nesn-body"
                name="nesn-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="nesn-body" hx-swap="innerHTML">
          <NesnBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
