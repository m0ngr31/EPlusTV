import {FC} from 'hono/jsx';

import { espnHandler } from '@/services/espn-handler';

export const Login: FC = async () => {
  const code = await espnHandler.getPlusAuthCode();

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/espnplus/login/check`}>
      <div class="grid-container">
        <div>
          <h5>ESPN+ Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://www.espn.com/watch/activate" target="_blank">
              https://www.espn.com/watch/activate
            </a>
          </span>
          <h6>Code: {code}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
