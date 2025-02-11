import {FC} from 'hono/jsx';

import {TGothamTokens} from '@/services/gotham-handler';
import {IProviderChannel} from '@/services/shared-interfaces';

interface IGothamBodyProps {
  enabled: boolean;
  tokens?: TGothamTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const GothamBody: FC<IGothamBodyProps> = ({enabled, tokens, open, channels}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="innerHTML" hx-target="this">
      <summary>
        <span>Linear Channels</span>
      </summary>
      <table class="striped">
        <thead>
          <tr>
            <th scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="grid-container">
        <h6>TV Provider:</h6>
        <fieldset>
          <label>
            Enabled&nbsp;&nbsp;
            <input
              hx-put="/providers/gotham/auth/tve"
              hx-trigger="change"
              hx-target="#gotham-body"
              name="gotham-tve-enabled"
              type="checkbox"
              role="switch"
              checked={tokens.adobe_token ? true : false}
              data-enabled={tokens.adobe_token ? 'true' : 'false'}
            />
          </label>
        </fieldset>
      </div>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/gotham/reauth" hx-trigger="submit">
            <button id="gotham-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
