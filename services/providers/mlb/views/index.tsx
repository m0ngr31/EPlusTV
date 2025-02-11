import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TMLBTokens} from '@/services/mlb-handler';

import {MlbBody} from './CardBody';

export const MlbTv: FC = async () => {
  const mlbtv = await db.providers.findOneAsync<IProvider<TMLBTokens>>({name: 'mlbtv'});
  const enabled = mlbtv?.enabled;
  const tokens = mlbtv?.tokens;
  const channels = mlbtv?.linear_channels || [];
  const onlyFree = mlbtv.meta?.onlyFree;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>MLB.tv</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/mlbtv/toggle`}
                hx-trigger="change"
                hx-target="#mlbtv-body"
                name="mlbtv-enabled"
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
              Only Free Games?&nbsp;&nbsp;
              <input
                hx-put={`/providers/mlbtv/toggle-free`}
                hx-trigger="change"
                name="mlbtv-onlyfree-enabled"
                hx-target="#mlbtv-body"
                type="checkbox"
                role="switch"
                checked={onlyFree ? true : false}
                data-enabled={onlyFree ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div id="mlbtv-body" hx-swap="innerHTML">
          <MlbBody enabled={enabled} tokens={tokens} channels={channels} />
        </div>
      </section>
      <hr />
    </div>
  );
};
