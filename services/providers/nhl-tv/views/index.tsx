import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TNHLTokens} from '@/services/nhltv-handler';
import {NHLBody} from './CardBody';

export const NHL: FC = async () => {
  const nhl = await db.providers.findOneAsync<IProvider<TNHLTokens>>({name: 'nhl'});
  const enabled = nhl?.enabled;
  const tokens = nhl?.tokens || {};

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>
            <span>
              NHL.tv
              <span class="warning-red" data-tooltip="Europe only" data-placement="right">
                **
              </span>
            </span>
          </h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/nhl/toggle`}
                hx-trigger="change"
                hx-target="#nhl-auth"
                name="nhl-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="nhl-auth" hx-swap="innerHTML">
          <NHLBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
