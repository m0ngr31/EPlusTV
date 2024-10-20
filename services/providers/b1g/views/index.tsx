import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { TB1GTokens } from '@/services/b1g-handler';

import { B1GBody } from './CardBody';

export const B1G: FC = async () => {
  const b1g = await db.providers.findOne<IProvider<TB1GTokens>>({name: 'b1g'});
  const enabled = b1g?.enabled;
  const tokens = b1g?.tokens;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>B1G+</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/b1g/toggle`}
                hx-trigger="change"
                hx-target="#b1g-body"
                name="b1g-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="b1g-body" hx-swap="innerHTML">
          <B1GBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
