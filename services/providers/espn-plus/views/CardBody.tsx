import {FC} from 'hono/jsx';

import { TESPNPlusTokens } from '@/services/espn-handler';

interface IESPNPlusBodyProps {
  enabled: boolean;
  tokens?: TESPNPlusTokens;
  open?: boolean;
}

export const ESPNPlusBody: FC<IESPNPlusBodyProps> = ({enabled, tokens, open}) => {
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
            hx-put="/providers/espnplus/reauth"
            hx-trigger="submit"
          >
            <button id="espnplus-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
