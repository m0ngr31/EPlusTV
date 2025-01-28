import {FC} from 'hono/jsx';

import { TParamountTokens } from '@/services/paramount-handler';
import { IProviderChannel } from '@/services/shared-interfaces';
import { usesLinear } from '@/services/misc-db-service';

interface IParamountBodyProps {
  enabled: boolean;
  tokens?: TParamountTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const ParamountBody: FC<IParamountBodyProps> = async ({enabled, tokens, open, channels}) => {
  const useLinear = await usesLinear();

  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
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
                  disabled={!useLinear}
                  hx-put={`/providers/paramount/channels/toggle/${c.id}`}
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
          <form hx-put="/providers/paramount/reauth" hx-trigger="submit">
            <button id="paramount-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
