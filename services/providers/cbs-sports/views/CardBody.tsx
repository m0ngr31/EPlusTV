import {FC} from 'hono/jsx';

import { TCBSTokens } from '@/services/cbs-handler';

interface ICBSBodyProps {
  enabled: boolean;
  tokens?: TCBSTokens;
  open?: boolean;
}

export const CBSBody: FC<ICBSBodyProps> = ({enabled, tokens, open}) => {
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
          <form
            hx-put="/providers/cbs/reauth"
            hx-trigger="submit"
          >
            <button id="cbs-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
