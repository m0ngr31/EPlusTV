import {FC} from 'hono/jsx';

interface ILoginProps {
  invalid?: boolean;
}

export const Login: FC<ILoginProps> = async ({invalid}) => {
  return (
    <div hx-target="this" hx-swap="outerHTML">
      <form hx-post="/providers/b1g/login" hx-trigger="submit" id="b1g-login-form">
        <fieldset class="grid">
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            name="username"
            id="b1g-username"
            placeholder="Username"
            aria-label="Username"
          />
          <input
            {...(invalid && {
              'aria-describedby': 'invalid-helper',
              'aria-invalid': 'true',
            })}
            id="b1g-password"
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Password"
          />
          <button type="submit" id="b1g-login">
            Log in
          </button>
        </fieldset>
        {invalid && <small id="invalid-helper">Login failed. Please try again.</small>}
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var form = document.getElementById('b1g-login-form');

            if (form) {
              form.addEventListener('htmx:beforeRequest', function() {
                this.querySelector('#b1g-login').setAttribute('aria-busy', 'true');
                this.querySelector('#b1g-login').setAttribute('aria-label', 'Loading…');
                this.querySelector('#b1g-username').disabled = true;
                this.querySelector('#b1g-password').disabled = true;
              });
            }
          `,
        }}
      />
    </div>
  );
};
