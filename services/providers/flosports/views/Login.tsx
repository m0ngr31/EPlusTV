import {FC} from 'hono/jsx';

import {floSportsHandler} from '@/services/flo-handler';

interface ILogin {
  code?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await floSportsHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/flosports/auth/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>FloSports Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://www.flolive.tv/activate" target="_blank">
              https://www.flolive.tv/activate
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
