import {FC} from 'hono/jsx';

import {mlbHandler} from '@/services/mlb-handler';

interface ILogin {
  code?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await mlbHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/mlbtv/auth/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>MLB.tv Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://ids.mlb.com/activate" target="_blank">
              https://ids.mlb.com/activate
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
