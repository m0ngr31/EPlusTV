import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';

import {BallyBody} from './CardBody';

export const Bally: FC = async () => {
  const bally = await db.providers.findOneAsync<IProvider>({name: 'bally'});
  const {enabled, linear_channels} = bally;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>
            <span>
              Bally Sports Live
              <span class="warning-red" data-tooltip="MiLB Games" data-placement="right">
                **
              </span>
            </span>
          </h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/bally/toggle`}
                hx-trigger="change"
                hx-target="#bally-body"
                name="bally-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="bally-body" hx-swap="innerHTML">
          <BallyBody channels={linear_channels} enabled={enabled} />
        </div>
      </section>
      <hr />
    </div>
  );
};
