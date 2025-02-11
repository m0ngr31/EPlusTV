import {FC} from 'hono/jsx';

import { TMLBTokens } from '@/services/mlb-handler';
import { IProviderChannel } from '@/services/shared-interfaces';

interface IMLBBodyProps {
  enabled: boolean;
  tokens?: TMLBTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const MlbBody: FC<IMLBBodyProps> = ({enabled, tokens, open, channels}) => {
  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <summary>
        <span>Linear Channels</span>
      </summary>
      <table class="striped">
        <thead>
          <tr>
            <th></th>
            <th scope="col">Name</th>
            {!channels[0].enabled && (
              <>
                <th scope="col">Notes</th>
                <th scope="col">Action</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id}>
              <td>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  data-enabled={c.enabled ? 'true' : 'false'}
                  disabled={true}
                />
              </td>
              <td>{c.name}</td>
              {!c.enabled && (
                <>
                  <td>
                    <a
                      href="https://www.mlb.com/login?campaignCode=mlbn2&redirectUri=/app/atbat/network/live&affiliateId=mlbapp-android_webview"
                      target="_blank"
                    >
                      Enable with TVE Provider
                    </a>
                    <span class="warning-red" data-tooltip="Only if your TVE Provider has MLB Network">
                      **
                    </span>
                  </td>
                  <td>
                    <form hx-trigger="submit" hx-put="/providers/mlbtv/mlbn-access" id="mlbtv-mlbn">
                      <button id="mlbtv-check-mlbn">Check TVE Access</button>
                    </form>
                    <script
                      dangerouslySetInnerHTML={{
                        __html: `
                          var recheckMlbNetworkAccess = document.getElementById('mlbtv-mlbn');

                          if (recheckMlbNetworkAccess) {
                            recheckMlbNetworkAccess.addEventListener('htmx:beforeRequest', function() {
                              this.querySelector('#mlbtv-check-mlbn').setAttribute('aria-busy', 'true');
                              this.querySelector('#mlbtv-check-mlbn').setAttribute('aria-label', 'Loading…');
                            });
                          }
                        `,
                      }}
                    />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/mlbtv/reauth" hx-trigger="submit">
            <button id="mlbtv-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
