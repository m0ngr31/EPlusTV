import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TWNBATokens} from '@/services/wnba-handler';

import {WNBABody} from './CardBody';

export const WNBA: FC = async () => {
  const wnba = await db.providers.findOneAsync<IProvider<TWNBATokens>>({name: 'wnba'});
  const enabled = wnba?.enabled;
  const tokens = wnba?.tokens;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>WNBA League Pass</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/wnba/toggle`}
                hx-trigger="change"
                hx-target="#wnba-body"
                name="wnba-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="wnba-body" hx-swap="innerHTML">
          <WNBABody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
