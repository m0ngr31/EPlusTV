import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TNFLTokens} from '@/services/nfl-handler';

import {NFLBody} from './CardBody';

export const NFL: FC = async () => {
  const nfl = await db.providers.findOneAsync<IProvider<TNFLTokens>>({name: 'nfl'});
  const enabled = nfl?.enabled;
  const tokens = nfl?.tokens;
  const channels = nfl?.linear_channels || [];

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>NFL</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/nfl/toggle`}
                hx-trigger="change"
                hx-target="#nfl-body"
                name="nfl-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="nfl-body" hx-swap="innerHTML">
          <NFLBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
