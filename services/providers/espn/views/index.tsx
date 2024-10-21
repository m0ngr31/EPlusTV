import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { IEspnMeta, TESPNTokens } from '@/services/espn-handler';

import { ESPNBody } from './CardBody';

export const ESPN: FC = async () => {
  const {enabled, tokens, linear_channels: channels, meta} = await db.providers.findOne<IProvider<TESPNTokens, IEspnMeta>>({name: 'espn'});

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>ESPN</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/espn/toggle`}
                hx-trigger="change"
                hx-target="#espn-body"
                name="espn-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="espn-body" hx-swap="innerHTML">
          <ESPNBody enabled={enabled} tokens={tokens} channels={channels} meta={meta} />
        </div>
      </section>
      <hr />
    </div>
  );
};
