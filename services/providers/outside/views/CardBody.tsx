import {FC} from 'hono/jsx';

import {TOutsideTokens} from '@/services/outside-handler';
import {IProviderChannel} from '@/services/shared-interfaces';
import {usesLinear} from '@/services/misc-db-service';

interface IOutsideBodyProps {
  enabled: boolean;
  tokens?: TOutsideTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const OutsideBody: FC<IOutsideBodyProps> = async ({enabled, tokens, open, channels}) => {
  const useLinear = await usesLinear();

  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <summary>
        <span data-tooltip="These are only enabled with Dedicated Linear Channels enabled" data-placement="right">
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
                  disabled={!useLinear}
                  hx-put={`/providers/outside/channels/toggle/${c.id}`}
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
          <form hx-put="/providers/outside/reauth" hx-trigger="submit">
            <button id="outside-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
