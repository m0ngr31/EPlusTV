import {FC} from 'hono/jsx';

import {outsideHandler} from '@/services/outside-handler';

interface ILogin {
  code?: string;
  loginLink?: string;
  checkLink?: string;
}

export const Login: FC<ILogin> = async ({code, loginLink, checkLink}) => {
  let shownCode = code;
  let loginUrl = loginLink;
  let checkUrl = checkLink;

  if (!shownCode || !loginLink) {
    [shownCode, loginUrl, checkUrl] = await outsideHandler.getAuthCode();
  }

  const shownLoginUrl = decodeURIComponent(loginUrl);

  return (
    <div
      hx-target="this"
      hx-swap="outerHTML"
      hx-trigger="every 5s"
      hx-get={`/providers/outside/tve-login/${shownCode}/${loginUrl}/${checkUrl}`}
    >
      <div class="grid-container">
        <div>
          <h5>Outside TV Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href={shownLoginUrl} target="_blank">
              {shownLoginUrl}
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
