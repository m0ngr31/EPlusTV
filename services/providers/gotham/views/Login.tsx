import {FC} from 'hono/jsx';

interface ILoginProps {
  invalid?: boolean;
}

export const Login: FC<ILoginProps> = async ({invalid}) => {
  return (
    <div hx-target="this" hx-swap="outerHTML">
      <form hx-post="/providers/gotham/login" hx-trigger="submit" id="gotham-login-form">
        <fieldset class="grid">
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            name="username"
            id="gotham-username"
            placeholder="Username"
            aria-label="Username"
          />
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            id="gotham-password"
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Password"
          />
          <button type="submit" id="gotham-login">
            Log in
          </button>
        </fieldset>
        {invalid && <small id="invalid-helper">Login failed. Please try again.</small>}
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var form = document.getElementById('gotham-login-form');

            if (form) {
              form.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#gotham-login').setAttribute('aria-busy', 'true');
                this.querySelector('#gotham-login').setAttribute('aria-label', 'Loading…');
                this.querySelector('#gotham-username').disabled = true;
                this.querySelector('#gotham-password').disabled = true;
              });
            }
          `,
        }}
      />
    </div>
  );
};
