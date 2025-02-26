import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

export const LOVB: FC = async () => {
  const lovb = await db.providers.findOneAsync<IProvider>({name: 'lovb'});
  const enabled = lovb?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>LOVB Live</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/lovb/toggle`}
                hx-trigger="change"
                hx-target="#lovb-body"
                name="lovb-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="lovb-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
