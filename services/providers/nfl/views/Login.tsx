import {FC} from 'hono/jsx';

import { nflHandler, TOtherAuth } from '@/services/nfl-handler';

interface ILogin {
  code?: string;
  otherAuth?: TOtherAuth;
}

export const Login: FC<ILogin> = async ({code, otherAuth}) => {
  let shownCode = code;

  if (!shownCode) {
    [shownCode] = await nflHandler.getAuthCode(otherAuth);
  }

  const otherAuthName =
    otherAuth === 'tve'
      ? ' (TV Provider)'
      : otherAuth === 'prime'
      ? ' (Amazon Prime)'
      : otherAuth === 'peacock'
      ? ' (Peacock)'
      : otherAuth === 'sunday_ticket'
      ? ' (Youtube)'
      : '';

  return (
    <div
      hx-target="this"
      hx-swap="outerHTML"
      hx-trigger="every 5s"
      hx-get={`/providers/nfl/login/${shownCode}/${otherAuth}`}
    >
      <div class="grid-container">
        <div>
          <h5>{`NFL Login${otherAuthName}`}:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href={`https://id.nfl.com/account/activate?regCode=${shownCode}`} target="_blank">
              {`https://id.nfl.com/account/activate?regCode=${shownCode}`}
            </a>
          </span>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
