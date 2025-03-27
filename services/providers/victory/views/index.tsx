import {FC} from 'hono/jsx';

import {db} from '@/services/database';
import {IProvider} from '@/services/shared-interfaces';
import {TVictoryTokens} from '@/services/victory-handler';

import {VictoryBody} from './CardBody';

export const Victory: FC = async () => {
  const victory = await db.providers.findOneAsync<IProvider<TVictoryTokens>>({name: 'victory'});
  const enabled = victory?.enabled;
  const tokens = victory?.tokens;
  const {stars, ducks, rangers, blues} = victory.meta;

  return (
    <div>
      <section class="overflow-auto provider-section">
        <div class="grid-container">
          <h4>Victory+</h4>
          <fieldset>
            <label>
              Enabled&nbsp;&nbsp;
              <input
                hx-put={`/providers/victory/toggle`}
                hx-trigger="change"
                hx-target="#victory-body"
                name="victory-enabled"
                type="checkbox"
                role="switch"
                checked={enabled ? true : false}
                data-enabled={enabled ? 'true' : 'false'}
              />
            </label>
          </fieldset>
        </div>
        <div class="grid-container">
          <div>
            <fieldset>
              <label>
                Dallas Stars?&nbsp;&nbsp;
                <input
                  hx-put={`/providers/victory/toggle-stars`}
                  hx-trigger="change"
                  name="victory-stars-enabled"
                  hx-target="#victory-body"
                  type="checkbox"
                  role="switch"
                  checked={stars ? true : false}
                  data-enabled={stars ? 'true' : 'false'}
                />
              </label>
            </fieldset>
            <fieldset>
              <label>
                Texas Rangers?&nbsp;&nbsp;
                <input
                  hx-put={`/providers/victory/toggle-rangers`}
                  hx-trigger="change"
                  name="victory-rangers-enabled"
                  hx-target="#victory-body"
                  type="checkbox"
                  role="switch"
                  checked={rangers ? true : false}
                  data-enabled={rangers ? 'true' : 'false'}
                />
              </label>
            </fieldset>
            <fieldset>
              <label>
                Anaheim Ducks?&nbsp;&nbsp;
                <input
                  hx-put={`/providers/victory/toggle-ducks`}
                  hx-trigger="change"
                  name="victory-ducks-enabled"
                  hx-target="#victory-body"
                  type="checkbox"
                  role="switch"
                  checked={ducks ? true : false}
                  data-enabled={ducks ? 'true' : 'false'}
                />
              </label>
            </fieldset>
            <fieldset>
              <label>
                St. Louis Blues?&nbsp;&nbsp;
                <input
                  hx-put={`/providers/victory/toggle-blues`}
                  hx-trigger="change"
                  name="victory-blues-enabled"
                  hx-target="#victory-body"
                  type="checkbox"
                  role="switch"
                  checked={blues ? true : false}
                  data-enabled={blues ? 'true' : 'false'}
                />
              </label>
            </fieldset>
          </div>
        </div>
        <div id="victory-body" hx-swap="innerHTML">
          <VictoryBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
    </div>
  );
};
