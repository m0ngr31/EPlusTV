import {FC} from 'hono/jsx';

import {TMLBTokens} from '@/services/mlb-handler';
import {IProviderChannel} from '@/services/shared-interfaces';

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

  const allEnabled = channels.filter(a => a.enabled).length === channels.length;

  const linkMap = [
    {},
    {
      btnText: 'Check TVE Access',
      hintText: 'Enable with TVE Provider',
      link: 'https://www.mlb.com/login?campaignCode=mlbn2&redirectUri=/app/atbat/network/live&affiliateId=mlbapp-android_webview',
      network: 'mlbn',
      toolTipText: 'Only if your TVE Provider has MLB Network',
    },
    {
      btnText: 'Check SNY Access',
      hintText: 'Enable with MLB.tv',
      link: 'https://www.mlb.com/commerce/mvpd/sny/link',
      network: 'sny',
    },
    {
      btnText: 'Check SNLA Access',
      hintText: 'Enable with MLB.tv',
      link: 'https://www.mlb.com/commerce/mvpd/getdodgers',
      network: 'snla',
    },
  ];

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
            {!allEnabled && (
              <>
                <th scope="col">Notes</th>
                <th scope="col">Action</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {channels.map((c, i) => (
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
              {!c.enabled ? (
                <>
                  {linkMap[i].link ? (
                    <>
                      <td>
                        <a href={linkMap[i].link} target="_blank">
                          {linkMap[i].hintText}
                        </a>
                        {linkMap[i].toolTipText && (
                          <span class="warning-red" data-tooltip={linkMap[i].toolTipText}>
                            **
                          </span>
                        )}
                      </td>
                      <td>
                        <form
                          hx-trigger="submit"
                          hx-put={`/providers/mlbtv/${linkMap[i].network}-access`}
                          id={`mlbtv-${linkMap[i].network}`}
                        >
                          <button id={`mlbtv-check-${linkMap[i].network}`}>{linkMap[i].btnText}</button>
                        </form>
                        <script
                          dangerouslySetInnerHTML={{
                            __html: `
                              var recheck${linkMap[i].network}Access = document.getElementById('mlbtv-${linkMap[i].network}');

                              if (recheck${linkMap[i].network}Access) {
                                recheck${linkMap[i].network}Access.addEventListener('htmx:beforeRequest', function() {
                                  this.querySelector('#mlbtv-check-${linkMap[i].network}').setAttribute('aria-busy', 'true');
                                  this.querySelector('#mlbtv-check-${linkMap[i].network}').setAttribute('aria-label', 'Loading…');
                                });
                              }
                            `,
                          }}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>Unlock with a full subscription on MLB.tv</td>
                      <td></td>
                    </>
                  )}
                </>
              ) : (
                <>
                  <td></td>
                  <td></td>
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
