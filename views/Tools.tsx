import type {FC} from 'hono/jsx';


export const Tools: FC = async () => {

  return (
    <section hx-swap="outerHTML" hx-target="this">
      <h3>Tools</h3>
      <div class="grid">
        <form
          id="rebuild-epg"
          hx-post="/rebuild-epg"
          hx-trigger="submit"
          hx-on="htmx:beforeRequest: this.querySelector('button').setAttribute('aria-busy', 'true'); this.querySelector('button').setAttribute('aria-label', 'Loading…');"
        >
          <button class="outline" id="rebuild-epg-button">
            Rebuild EPG
          </button>
        </form>
      </div>
      <hr />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var form = document.getElementById('rebuild-epg');

            if (form) {
              form.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#rebuild-epg-button').setAttribute('aria-busy', 'true');
                this.querySelector('#rebuild-epg-button').setAttribute('aria-label', 'Loading…');
              });
            }
          `,
        }}
      />
    </section>
  );
};
