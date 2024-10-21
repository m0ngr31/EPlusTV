import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { IEspnPlusMeta, TESPNPlusTokens } from '@/services/espn-handler';

import { ESPNPlusBody } from './CardBody';

export const ESPNPlus: FC = async () => {
  const {enabled, tokens, meta} = await db.providers.findOne<IProvider<TESPNPlusTokens, IEspnPlusMeta>>({
    name: 'espnplus',
  });

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>ESPN+</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/espnplus/toggle`}
                hx-trigger="change"
                hx-target="#espnplus-body"
                name="espnplus-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div class="grid-container">
          <div />
          <fieldset>
            <label>
              PPV Events?&nbsp;&nbsp;
              <input
                hx-put={`/providers/espnplus/toggle-ppv`}
                hx-trigger="change"
                name="espnplus-ppv-enabled"
                hx-target="#espnplus-body"
                type="checkbox"
                role="switch"
                checked={meta.use_ppv ? true : false}
                data-enabled={meta.use_ppv ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="espnplus-body" hx-swap="innerHTML">
          <ESPNPlusBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
