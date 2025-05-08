import {FC} from 'hono/jsx';

interface ILoginProps {
  invalid?: boolean;
}

export const Login: FC<ILoginProps> = async ({invalid}) => {
  return (
    <div hx-target="this" hx-swap="outerHTML">
      <form hx-post="/providers/wnba/login" hx-trigger="submit" id="wnba-login-form">
        <fieldset class="grid">
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            name="username"
            id="wnba-username"
            placeholder="Username"
            aria-label="Username"
          />
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            id="wnba-password"
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Password"
          />
          <button type="submit" id="wnba-login">
            Log in
          </button>
        </fieldset>
        {invalid && <small id="invalid-helper">Login failed. Please try again.</small>}
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var form = document.getElementById('wnba-login-form');

            if (form) {
              form.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#wnba-login').setAttribute('aria-busy', 'true');
                this.querySelector('#wnba-login').setAttribute('aria-label', 'Loading…');
                this.querySelector('#wnba-username').disabled = true;
                this.querySelector('#wnba-password').disabled = true;
              });
            }
          `,
        }}
      />
    </div>
  );
};
