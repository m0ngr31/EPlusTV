import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TNwslTokens} from '@/services/nwsl-handler';

import {NwslBody} from './CardBody';

export const Nwsl: FC = async () => {
  const nwsl = await db.providers.findOneAsync<IProvider<TNwslTokens>>({name: 'nwsl'});
  const {enabled, tokens, linear_channels} = nwsl;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>NWSL+</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/nwsl/toggle`}
                hx-trigger="change"
                hx-target="#nwsl-body"
                name="nwsl-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="nwsl-body" hx-swap="innerHTML">
          <NwslBody enabled={enabled} tokens={tokens} channels={linear_channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
