import {FC} from 'hono/jsx';

import {TVictoryTokens} from '@/services/victory-handler';

interface IVictoryBodyProps {
  enabled: boolean;
  tokens?: TVictoryTokens;
  open?: boolean;
}

export const VictoryBody: FC<IVictoryBodyProps> = ({enabled, tokens, open}) => {
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
          <form hx-put="/providers/victory/reauth" hx-trigger="submit">
            <button id="victory-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
