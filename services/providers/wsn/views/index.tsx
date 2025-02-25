import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

export const WSN: FC = async () => {
  const wsn = await db.providers.findOneAsync<IProvider>({name: 'wsn'});
  const enabled = wsn?.enabled;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>
            <span>
              Women's Sports Network{' '}
              <span class="warning-red" data-tooltip="Linear only" data-placement="right">
                **
              </span>
            </span>
          </h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/wsn/toggle`}
                hx-trigger="change"
                hx-target="#wsn-body"
                name="wsn-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="wsn-body" hx-swap="outerHTML" />
      </section>
      <hr />
    </div>
  );
};
