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
        <div class="grid">
          <form id="category-filter" hx-post="/providers/espnplus/category-filter" hx-trigger="submit">
            <label>
              <span>
                Category Filter (<a href="https://www.espn.com/espnplus/browse/" target="_blank">examples</a>){' '}
                <span
                  class="warning-red"
                  data-tooltip="Making changes will break/invalidate existing ESPN+ scheduled recordings"
                  data-placement="right"
                >
                  **
                </span>
              </span>
              <fieldset role="group">
                <input
                  type="text"
                  placeholder="comma-separated list of categories to include, leave blank for all"
                  value={meta.category_filter}
                  data-value={meta.category_filter}
                  name="espnplus-category-filter"
                />
                <button type="submit" id="category-filter-button">
                  Save
                </button>
              </fieldset>
            </label>
          </form>
        </div>
        <div class="grid">
          <form id="title-filter" hx-post="/providers/espnplus/title-filter" hx-trigger="submit">
            <label>
              <span>
                Title Filter{' '}
                <span
                  class="warning-red"
                  data-tooltip="Making changes will break/invalidate existing ESPN+ scheduled recordings"
                  data-placement="right"
                >
                  **
                </span>
              </span>
              <fieldset role="group">
                <input
                  type="text"
                  placeholder="if specified, only include events with matching titles; supports regular expressions"
                  value={meta.title_filter}
                  data-value={meta.title_filter}
                  name="espnplus-title-filter"
                />
                <button type="submit" id="title-filter-button">
                  Save
                </button>
              </fieldset>
            </label>
          </form>
        </div>
        <div id="espnplus-body" hx-swap="innerHTML">
          <ESPNPlusBody enabled={enabled} tokens={tokens} />
        </div>
      </section>
      <hr />
      <script
        dangerouslySetInnerHTML={{
          __html: `
          var rebuildEpgForm = document.getElementById('category-filter');

          if (rebuildEpgForm) {
            rebuildEpgForm.addEventListener('htmx:beforeRequest', function() {
              this.querySelector('#category-filter-button').setAttribute('aria-busy', 'true');
              this.querySelector('#category-filter-button').setAttribute('aria-label', 'Loading…');
            });
          }
        `,
        }}
      />
    </div>
  );
};
