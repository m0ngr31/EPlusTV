import {FC} from 'hono/jsx';

import { TB1GTokens } from '@/services/b1g-handler';

interface IB1GBodyProps {
  enabled: boolean;
  tokens?: TB1GTokens;
  open?: boolean;
}

export const B1GBody: FC<IB1GBodyProps> = ({enabled, tokens, open}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return null;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form
            hx-put="/providers/b1g/reauth"
            hx-trigger="submit"
          >
            <button id="b1g-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
