import {FC} from 'hono/jsx';

import {TWNBATokens} from '@/services/wnba-handler';

interface IWNBABodyProps {
  enabled: boolean;
  tokens?: TWNBATokens;
  open?: boolean;
}

export const WNBABody: FC<IWNBABodyProps> = ({enabled, tokens, open}) => {
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
          <form hx-put="/providers/wnba/reauth" hx-trigger="submit">
            <button id="wnba-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
