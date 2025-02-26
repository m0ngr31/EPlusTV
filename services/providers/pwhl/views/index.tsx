import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

export const PWHL: FC = async () => {
  const pwhl = await db.providers.findOneAsync<IProvider>({name: 'pwhl'});
  const enabled = pwhl?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>PWHL</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/pwhl/toggle`}
                hx-trigger="change"
                hx-target="#pwhl-body"
                name="pwhl-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="pwhl-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
