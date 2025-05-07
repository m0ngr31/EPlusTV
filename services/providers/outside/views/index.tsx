import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TOutsideTokens} from '@/services/outside-handler';

import {OutsideBody} from './CardBody';

export const Outside: FC = async () => {
  const outside = await db.providers.findOneAsync<IProvider<TOutsideTokens>>({name: 'outside'});
  const enabled = outside?.enabled;
  const tokens = outside?.tokens;
  const channels = outside?.linear_channels || [];

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Outside TV</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/outside/toggle`}
                hx-trigger="change"
                hx-target="#outside-body"
                name="outside-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="outside-body" hx-swap="innerHTML">
          <OutsideBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
