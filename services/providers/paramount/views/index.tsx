import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TParamountTokens} from '@/services/paramount-handler';

import {ParamountBody} from './CardBody';

export const Paramount: FC = async () => {
  const paramount = await db.providers.findOneAsync<IProvider<TParamountTokens>>({name: 'paramount'});
  const enabled = paramount?.enabled;
  const tokens = paramount?.tokens;
  const channels = paramount?.linear_channels || [];

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Paramount+</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/paramount/toggle`}
                hx-trigger="change"
                hx-target="#paramount-body"
                name="paramount-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="paramount-body" hx-swap="innerHTML">
          <ParamountBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
