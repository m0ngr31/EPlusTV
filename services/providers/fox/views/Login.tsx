import {FC} from 'hono/jsx';

import {foxHandler} from '@/services/fox-handler';

interface ILogin {
  code?: string;
  deviceToken?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await foxHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/fox/tve-login/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>FOX Sports Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://go.foxsports.com" target="_blank">
              https://go.foxsports.com
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
