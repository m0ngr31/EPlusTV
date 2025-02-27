import {FC} from 'hono/jsx';

import {TNHLTokens} from '@/services/nhltv-handler';

interface INHLBodyProps {
  enabled: boolean;
  tokens?: TNHLTokens;
  open?: boolean;
}

export const NHLBody: FC<INHLBodyProps> = ({enabled, tokens, open}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/nhl/reauth" hx-trigger="submit">
            <button id="nhl-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
