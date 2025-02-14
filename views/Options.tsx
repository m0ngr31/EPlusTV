import type {FC} from 'hono/jsx';

import {
  getNumberOfChannels,
  getStartChannel,
  proxySegments,
  usesLinear,
  xmltvPadding,
  getCategoryFilter,
  getTitleFilter,
} from '@/services/misc-db-service';

export const Options: FC = async () => {
  const startChannel = await getStartChannel();
  const numOfChannels = await getNumberOfChannels();
  const linearChannels = await usesLinear();
  const proxiedSegments = await proxySegments();
  const xmltvPadded = await xmltvPadding();
  const categoryFilter = await getCategoryFilter();
  const titleFilter = await getTitleFilter();

  return (
    <section hx-swap="outerHTML" hx-target="this">
      <h3>Options</h3>
      <div class="grid">
        <form id="start-channel" hx-post="/start-channel" hx-trigger="submit">
          <label>
            <span>
              Starting Channel #{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </span>
            <fieldset role="group">
              <input
                type="number"
                placeholder="Starting Channel #"
                value={startChannel}
                data-value={startChannel}
                name="start-channel"
                min={1}
                max={10000}
                required
              />
              <button type="submit" id="start-channel-button">
                Save
              </button>
            </fieldset>
          </label>
        </form>
        <form id="num-of-channels" hx-post="/num-of-channels" hx-trigger="submit">
          <label>
            <span>
              # of Channels{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </span>
            <fieldset role="group">
              <input
                type="number"
                placeholder="# of Channels"
                value={numOfChannels}
                data-value={numOfChannels}
                name="num-of-channels"
                min={0}
                max={5000}
                required
              />
              <button type="submit" id="num-of-channels-button">
                Save
              </button>
            </fieldset>
            {/* <small id="email-helper">We'll never share your email with anyone else.</small> */}
          </label>
        </form>
      </div>
      <div class="grid">
        <fieldset>
          <label>
            <input
              hx-target="this"
              hx-swap="outerHTML"
              hx-trigger="change"
              hx-post="/linear-channels"
              name="linear-channels"
              type="checkbox"
              role="switch"
              checked={linearChannels}
              data-enabled={linearChannels ? 'true' : 'false'}
            />
            <span>
              Dedicated Linear Channels?{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <label>
            <input
              hx-post="/proxy-segments"
              hx-target="this"
              hx-swap="outerHTML"
              hx-trigger="change"
              name="proxy-segments"
              type="checkbox"
              role="switch"
              checked={proxiedSegments}
              data-enabled={proxiedSegments ? 'true' : 'false'}
            />
            Proxy segment files?
          </label>
        </fieldset>
        <fieldset>
          <label>
            <input
              hx-post="/xmltv-padding"
              hx-target="this"
              hx-swap="outerHTML"
              hx-trigger="change"
              name="xmltv-padding"
              type="checkbox"
              role="switch"
              checked={xmltvPadded}
              data-enabled={xmltvPadded ? 'true' : 'false'}
            />
            Pad XMLTV event end times?
          </label>
        </fieldset>
      </div>
      <div class="grid">
        <form
          id="event-filters"
          hx-put="/event-filters"
          hx-trigger="submit"
          hx-swap="outerHTML"
          hx-target="#event-filters-button"
        >
          <div>
            <span>Category Filter{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </span>
            <fieldset role="group">
              <input
                type="text"
                placeholder="comma-separated list of categories to include, leave blank for all"
                value={categoryFilter}
                data-value={categoryFilter}
                name="category-filter"
              />
            </fieldset>
            <span>Title Filter{' '}
              <span
                class="warning-red"
                data-tooltip="Making changes will break/invalidate existing scheduled recordings"
                data-placement="right"
              >
                **
              </span>
            </span>
            <fieldset role="group">
              <input
                type="text"
                placeholder="if specified, only include events with matching titles; supports regular expressions"
                value={titleFilter}
                data-value={titleFilter}
                name="title-filter"
              />
            </fieldset>
            <button type="submit" id="event-filters-button">
              Save and Apply Event Filters
            </button>
          </div>
        </form>
      </div>
      <hr />
      <script
        dangerouslySetInnerHTML={{
          __html: `
          var rebuildEpgForm = document.getElementById('start-channel');

          if (rebuildEpgForm) {
            rebuildEpgForm.addEventListener('htmx:beforeRequest', function() {
              this.querySelector('#start-channel-button').setAttribute('aria-busy', 'true');
              this.querySelector('#start-channel-button').setAttribute('aria-label', 'Loading…');
            });
          }

          var resetChannelsForm = document.getElementById('num-of-channels');

          if (resetChannelsForm) {
            resetChannelsForm.addEventListener('htmx:beforeRequest', function() {
              this.querySelector('#num-of-channels-button').setAttribute('aria-busy', 'true');
              this.querySelector('#num-of-channels-button').setAttribute('aria-label', 'Loading…');
            });
          }

          var eventFiltersForm = document.getElementById('event-filters');

          if (eventFiltersForm) {
            eventFiltersForm.addEventListener('htmx:beforeRequest', function() {
              this.querySelector('#event-filters-button').setAttribute('aria-busy', 'true');
              this.querySelector('#event-filters-button').setAttribute('aria-label', 'Loading…');
            });
          }
        `,
        }}
      />
    </section>
  );
};
