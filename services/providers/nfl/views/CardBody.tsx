import {FC} from 'hono/jsx';

import { TNFLTokens } from '@/services/nfl-handler';
import { IProviderChannel } from '@/services/shared-interfaces';
import { usesLinear } from '@/services/misc-db-service';

interface INFLBodyProps {
  enabled: boolean;
  tokens?: TNFLTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const NFLBody: FC<INFLBodyProps> = async ({enabled, tokens, open, channels}) => {
  const useLinear = await usesLinear();

  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return null;
  }

  return (
    <div hx-swap="innerHTML" hx-target="this">
      <summary>
        <span
          data-tooltip="These are only enabled with Dedicated Linear Channels enabled"
          data-placement="right"
        >
          Linear Channels
        </span>
      </summary>
      <table class="striped">
        <thead>
          <tr>
            <th></th>
            <th scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id}>
              <td>
                <input
                  hx-target="this"
                  hx-swap="outerHTML"
                  type="checkbox"
                  checked={c.enabled}
                  data-enabled={c.enabled ? 'true' : 'false'}
                  disabled={!useLinear || c.id === 'NFLNRZ'}
                  hx-put={`/providers/nfl/channels/toggle/${c.id}`}
                  hx-trigger="change"
                  name="channel-enabled"
                />
              </td>
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
              hx-put="/providers/nfl/auth/tve"
              hx-trigger="change"
              hx-target="#nfl-body"
              name="nfl-tve-enabled"
              type="checkbox"
              role="switch"
              checked={tokens.mvpdIdp ? true : false}
              data-enabled={tokens.mvpdIdp ? 'true' : 'false'}
            />
          </label>
        </fieldset>
      </div>
      <div class="grid-container">
        <h6>Peacock:</h6>
        <fieldset>
          <label>
            Enabled&nbsp;&nbsp;
            <input
              hx-put="/providers/nfl/auth/peacock"
              hx-trigger="change"
              hx-target="#nfl-body"
              name="nfl-peacock-enabled"
              type="checkbox"
              role="switch"
              checked={tokens.peacockUserId ? true : false}
              data-enabled={tokens.peacockUserId ? 'true' : 'false'}
            />
          </label>
        </fieldset>
      </div>
      <div class="grid-container">
        <h6>Amazon Prime:</h6>
        <fieldset>
          <label>
            Enabled&nbsp;&nbsp;
            <input
              hx-put="/providers/nfl/auth/prime"
              hx-trigger="change"
              hx-target="#nfl-body"
              name="nfl-prime-enabled"
              type="checkbox"
              role="switch"
              checked={tokens.amazonPrimeUserId ? true : false}
              data-enabled={tokens.amazonPrimeUserId ? 'true' : 'false'}
            />
          </label>
        </fieldset>
      </div>
      <div class="grid-container">
        <h6>Sunday Ticket:</h6>
        <fieldset>
          <label>
            Enabled&nbsp;&nbsp;
            <input
              hx-put="/providers/nfl/auth/sunday_ticket"
              hx-trigger="change"
              hx-target="#nfl-body"
              name="nfl-sunday_ticket-enabled"
              type="checkbox"
              role="switch"
              checked={tokens.youTubeUserId ? true : false}
              data-enabled={tokens.youTubeUserId ? 'true' : 'false'}
            />
          </label>
        </fieldset>
      </div>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/nfl/reauth" hx-trigger="submit">
            <button id="nfl-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
