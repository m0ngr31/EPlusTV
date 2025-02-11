import {FC} from 'hono/jsx';

import { db } from '@/services/database';
import { IProvider } from '@/services/shared-interfaces';
import { IEspnPlusMeta, TESPNPlusTokens } from '@/services/espn-handler';

import { ESPNPlusBody } from './CardBody';

export const ESPNPlus: FC = async () => {
  const {enabled, tokens, meta} = await db.providers.findOneAsync<IProvider<TESPNPlusTokens, IEspnPlusMeta>>({
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
        <div class="grid">
          <details>
            <summary>ESPN+ Options{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing ESPN+ scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </summary>
            <span>
              In-Market Teams
            </span>
            <fieldset role="group">
              <form id="espnplus-refresh-in-market-teams" hx-put="/providers/espnplus/refresh-in-market-teams" hx-trigger="submit">
                <div>
                  <pre>{meta.in_market_teams} ({meta.zip_code})</pre>
                  <button id="espnplus-refresh-in-market-teams-button">Refresh In-Market Teams</button>
                </div>
              </form>
            </fieldset>
            <form id="espnplus-event-filters" hx-put="/providers/espnplus/save-filters" hx-trigger="submit" hx-swap="outerHTML" hx-target="#espnplus-save-filters-button">
              <div>
                <span>
                  Category Filter
                </span>
                <fieldset role="group">
                  <input
                    type="text"
                    placeholder="comma-separated list of categories to include, leave blank for all"
                    value={meta.category_filter}
                    data-value={meta.category_filter}
                    name="espnplus-category-filter"
                  />
                </fieldset>
                <span>
                  Title Filter
                </span>
                <fieldset role="group">
                  <input
                    type="text"
                    placeholder="if specified, only include events with matching titles; supports regular expressions"
                    value={meta.title_filter}
                    data-value={meta.title_filter}
                    name="espnplus-title-filter"
                  />
                </fieldset>
                <button type="submit" id="espnplus-save-filters-button">
                  Save and Apply Filters
                </button>
              </div>
            </form>
          </details>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            var rebuildEpgForm = document.getElementById('espnplus-event-filters');

            if (rebuildEpgForm) {
              rebuildEpgForm.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#espnplus-save-filters-button').setAttribute('aria-busy', 'true');
                this.querySelector('#espnplus-save-filters-button').setAttribute('aria-label', 'Loading…');
              });
            }

            var rebuildEpgForm = document.getElementById('espnplus-refresh-in-market-teams');

            if (rebuildEpgForm) {
              rebuildEpgForm.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#espnplus-refresh-in-market-teams-button').setAttribute('aria-busy', 'true');
                this.querySelector('#espnplus-refresh-in-market-teams-button').setAttribute('aria-label', 'Loading…');
              });
            }
          `,
          }}
        />
      </section>
      <hr />
    </div>
  );
};
