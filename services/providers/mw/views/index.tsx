import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';

export const MntWest: FC = async () => {
  const mw = await db.providers.findOne<IProvider>({name: 'mw'});
  const enabled = mw?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Mountain West</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/mw/toggle`}
                hx-trigger="change"
                hx-target="#mw-body"
                name="mw-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="mw-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
