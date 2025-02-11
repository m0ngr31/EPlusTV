import {FC} from 'hono/jsx';

import {TFloSportsTokens} from '@/services/flo-handler';

interface IFloSportsBodyProps {
  enabled: boolean;
  tokens?: TFloSportsTokens;
  open?: boolean;
}

export const FloSportsBody: FC<IFloSportsBodyProps> = ({enabled, tokens, open}) => {
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
          <form hx-put="/providers/flosports/reauth" hx-trigger="submit">
            <button id="flosports-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
