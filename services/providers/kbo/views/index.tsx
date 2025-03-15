import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

export const KBO: FC = async () => {
  const kbo = await db.providers.findOneAsync<IProvider>({name: 'kbo'});
  const enabled = kbo?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>KBO</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/kbo/toggle`}
                hx-trigger="change"
                hx-target="#kbo-body"
                name="kbo-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="kbo-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
