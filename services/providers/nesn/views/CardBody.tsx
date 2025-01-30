import {FC} from 'hono/jsx';

import { TNesnTokens } from '@/services/nesn-handler';
import { IProviderChannel } from '@/services/shared-interfaces';

interface INesnBodyProps {
  enabled: boolean;
  tokens?: TNesnTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const NesnBody: FC<INesnBodyProps> = ({enabled, tokens, open, channels}) => {
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
            hx-put="/providers/nesn/reauth"
            hx-trigger="submit"
          >
            <button id="nesn-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
