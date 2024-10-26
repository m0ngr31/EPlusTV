import {FC} from 'hono/jsx';

import {gothamHandler} from '@/services/gotham-handler';

interface ILogin {
  link?: string;
}

export const TVELogin: FC<ILogin> = async ({link}) => {
  let hashedLink = '';
  let shownLink = '';

  if (!link) {
    shownLink = await gothamHandler.getAuthCode();
    hashedLink = Buffer.from(shownLink).toString('base64');
  } else {
    hashedLink = link;
    shownLink = Buffer.from(hashedLink, 'base64').toString();
  }

  return (
    <div
      hx-target="this"
      hx-swap="outerHTML"
      hx-trigger="every 5s"
      hx-get={`/providers/gotham/tve-login/${hashedLink}`}
    >
      <div class="grid-container">
        <div>
          <h5>{`Gotham Sports TV Login`}:</h5>
          {shownLink !== 'Loading...' ? (
            <span>
              Open this link and follow instructions:
              <br />

                <a href={shownLink} target="_blank">
                  {shownLink}
                </a>
            </span>
            ) : (
              <span>Trying to refresh Adobe auth...</span>
            )}
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
