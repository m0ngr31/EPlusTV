import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TFloSportsTokens} from '@/services/flo-handler';

import {FloSportsBody} from './CardBody';

export const FloSports: FC = async () => {
  const parmount = await db.providers.findOneAsync<IProvider<TFloSportsTokens>>({name: 'flosports'});
  const enabled = parmount?.enabled;
  const tokens = parmount?.tokens;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>FloSports</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/flosports/toggle`}
                hx-trigger="change"
                hx-target="#flosports-body"
                name="flosports-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="flosports-body" hx-swap="innerHTML">
          <FloSportsBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
