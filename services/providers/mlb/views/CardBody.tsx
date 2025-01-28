import {FC} from 'hono/jsx';

import { TMLBTokens } from '@/services/mlb-handler';
import { IProviderChannel } from '@/services/shared-interfaces';

interface IMLBBodyProps {
  enabled: boolean;
  tokens?: TMLBTokens;
  open?: boolean;
  channels: IProviderChannel[];
  onlyFree?: boolean;
}

export const MlbBody: FC<IMLBBodyProps> = ({enabled, tokens, open, channels, onlyFree}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <summary>
        <span>
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
                  checked={c.enabled && !onlyFree}
                  data-enabled={c.enabled && !onlyFree ? 'true' : 'false'}
                  disabled={onlyFree}
                  hx-put={`/providers/mlbtv/channels/toggle/${c.id}`}
                  hx-trigger="change"
                  name="channel-enabled"
                />
              </td>
              <td>{c.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form
            hx-put="/providers/mlbtv/reauth"
            hx-trigger="submit"
          >
            <button id="mlbtv-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
