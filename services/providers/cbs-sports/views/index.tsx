import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TCBSTokens} from '@/services/cbs-handler';
import {CBSBody} from './CardBody';

export const CBSSports: FC = async () => {
  const cbs = await db.providers.findOneAsync<IProvider<TCBSTokens>>({name: 'cbs'});
  const enabled = cbs?.enabled;
  const tokens = cbs?.tokens || {};

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>CBS Sports</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/cbs/toggle`}
                hx-trigger="change"
                hx-target="#cbs-auth"
                name="cbs-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="cbs-auth" hx-swap="innerHTML">
          <CBSBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
