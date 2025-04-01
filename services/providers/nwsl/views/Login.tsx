import {FC} from 'hono/jsx';

interface ILoginProps {
  invalid?: boolean;
}

export const Login: FC<ILoginProps> = async ({invalid}) => {
  return (
    <div hx-target="this" hx-swap="outerHTML">
      <form hx-post="/providers/nwsl/login" hx-trigger="submit" id="nwsl-login-form">
        <fieldset class="grid">
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            name="username"
            id="nwsl-username"
            placeholder="Username"
            aria-label="Username"
          />
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            id="nwsl-password"
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Password"
          />
          <button type="submit" id="nwsl-login">
            Log in
          </button>
        </fieldset>
        {invalid && <small id="invalid-helper">Login failed. Please try again.</small>}
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var form = document.getElementById('nwsl-login-form');

            if (form) {
              form.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#nwsl-login').setAttribute('aria-busy', 'true');
                this.querySelector('#nwsl-login').setAttribute('aria-label', 'Loading…');
                this.querySelector('#nwsl-username').disabled = true;
                this.querySelector('#nwsl-password').disabled = true;
              });
            }
          `,
        }}
      />
    </div>
  );
};
