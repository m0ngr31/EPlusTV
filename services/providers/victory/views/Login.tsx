import {FC} from 'hono/jsx';

import {victoryHandler} from '@/services/victory-handler';

interface ILogin {
  code?: string;
}

export const Login: FC<ILogin> = async ({code}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await victoryHandler.getAuthCode();
  }

  return (
    <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/victory/auth/${shownCode}`}>
      <div class="grid-container">
        <div>
          <h5>Victory+ Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href="https://victoryplus.com/pair" target="_blank">
              https://victoryplus.com/pair
            </a>
          </span>
          <h6>Code: {shownCode}</h6>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
