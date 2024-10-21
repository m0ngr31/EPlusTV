import type {FC} from 'hono/jsx';


export const Tools: FC = async () => {

  return (
    <section hx-swap="outerHTML" hx-target="this">
      <h3>Tools</h3>
      <div class="grid">
        <form id="rebuild-epg" hx-post="/rebuild-epg" hx-trigger="submit">
          <button class="outline" id="rebuild-epg-button">
            Rebuild EPG
          </button>
        </form>
        <form id="reset-channels" hx-post="/reset-channels" hx-trigger="submit">
          <button class="outline" id="reset-channels-button">
            Reset Active Channels
          </button>
        </form>
      </div>
      <hr />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var rebuildEpgForm = document.getElementById('rebuild-epg');

            if (rebuildEpgForm) {
              rebuildEpgForm.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#rebuild-epg-button').setAttribute('aria-busy', 'true');
                this.querySelector('#rebuild-epg-button').setAttribute('aria-label', 'Loading…');
              });
            }

            var resetChannelsForm = document.getElementById('reset-channels');

            if (resetChannelsForm) {
              resetChannelsForm.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#reset-channels-button').setAttribute('aria-busy', 'true');
                this.querySelector('#reset-channels-button').setAttribute('aria-label', 'Loading…');
              });
            }
          `,
        }}
      />
    </section>
  );
};
