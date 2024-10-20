import {FC} from 'hono/jsx';

import { TFoxTokens } from '@/services/fox-handler';
import { IProviderChannel } from '@/services/shared-interfaces';

interface IFoxBodyProps {
  enabled: boolean;
  tokens?: TFoxTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const FoxBody: FC<IFoxBodyProps> = ({enabled, tokens, open, channels}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return null;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <summary>
        <span
          data-tooltip="These are only enabled with the LINEAR_CHANNELS environment variable set"
          data-placement="right"
        >
          Linear Channels
        </span>
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
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form
            hx-put="/providers/fox/reauth"
            hx-trigger="submit"
          >
            <button id="fox-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
