import {FC} from 'hono/jsx';

import {paramountHandler} from '@/services/paramount-handler';

interface ILogin {
  code?: string;
  deviceToken?: string;
}

export const Login: FC<ILogin> = async ({code, deviceToken}) => {
  let shownCode = code;
  let token = deviceToken;

  if (!shownCode || !token) {
    [shownCode, token] = await paramountHandler.getAuthCode();
  }

  return (
    <div
      hx-target="this"
      hx-swap="outerHTML"
      hx-trigger="every 5s"
      hx-get={`/providers/paramount/tve-login/${shownCode}/${token}`}
    >
      <div class="grid-container">
        <div>
          <h5>Paramount+ Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://www.paramountplus.com/activate/androidtv" target="_blank">
              https://www.paramountplus.com/activate/androidtv
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
