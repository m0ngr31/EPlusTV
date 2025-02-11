import {FC} from 'hono/jsx';

import {cbsHandler} from '@/services/cbs-handler';

interface ILogin {
  code?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await cbsHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/cbs/tve-login/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>TVE Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href={`https://www.cbssports.com/firetv/${shownCode}`} target="_blank">
              {`https://www.cbssports.com/firetv/${shownCode}`}
            </a>
          </span>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
