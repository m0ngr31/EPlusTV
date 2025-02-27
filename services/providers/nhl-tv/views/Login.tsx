import {FC} from 'hono/jsx';

import {nhlHandler} from '@/services/nhltv-handler';

interface ILogin {
  code?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await nhlHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/nhl/login/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="http://nhltv.nhl.com/code" target="_blank">
              http://nhltv.nhl.com/code
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
