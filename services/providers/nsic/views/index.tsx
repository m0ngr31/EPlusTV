import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

export const NorthernSun: FC = async () => {
  const nsic = await db.providers.findOneAsync<IProvider>({name: 'nsic'});
  const enabled = nsic?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Northern Sun</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/nsic/toggle`}
                hx-trigger="change"
                hx-target="#nsic-body"
                name="nsic-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="nsic-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
