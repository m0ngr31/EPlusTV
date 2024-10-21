import {FC} from 'hono/jsx';

import { nesnHandler } from '@/services/nesn-handler';

interface ILogin {
  url?: string;
  code?: string;
  adobeCode?: string;
}

export const Login: FC<ILogin> = async ({url, code, adobeCode}) => {
  let actualUrl = url;
  let shownCode = code;
  let adobeRegCode = adobeCode;

  if (!shownCode || !actualUrl || !adobeCode) {
    [actualUrl, shownCode, adobeRegCode] = await nesnHandler.getAuthCode();
  }

  const hashedUrl = Buffer.from(actualUrl).toString('base64');

  return (
    <div
      hx-target="this"
      hx-swap="outerHTML"
      hx-trigger="every 5s"
      hx-get={`/providers/nesn/tve-login/${shownCode}/${adobeRegCode}/${hashedUrl}`}
    >
      <div class="grid-container">
        <div>
          <h5>TVE Login:</h5>
          <span>
            Open this link and follow instructions:
            <br />
            <a href={actualUrl} target="_blank">
              {actualUrl}
            </a>
          </span>
        </div>
        <div aria-busy="true" style="align-content: center" />
      </div>
    </div>
  );
};
