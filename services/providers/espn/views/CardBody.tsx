import {FC} from 'hono/jsx';

import {IEspnMeta, TESPNTokens} from '@/services/espn-handler';
import {IProviderChannel} from '@/services/shared-interfaces';

interface IESPNBodyProps {
  enabled: boolean;
  tokens?: TESPNTokens;
  open?: boolean;
  channels: IProviderChannel[];
  meta: IEspnMeta;
}

export const ESPNBody: FC<IESPNBodyProps> = ({enabled, tokens, open, channels, meta}) => {
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
          </tr>
        </thead>
        <tbody>
          {channels.map(c => (
            <tr key={c.id}>
              <td>
                <input
                  hx-target="this"
                  hx-swap="outerHTML"
                  type="checkbox"
                  checked={c.enabled}
                  data-enabled={c.enabled ? 'true' : 'false'}
                  hx-put={`/providers/espn/channels/toggle/${c.id}`}
                  hx-trigger="change"
                  name="channel-enabled"
                />
              </td>
              <td>{c.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <summary>
        <span>Digital Networks</span>
      </summary>
      <table class="striped">
        <thead>
          <tr>
            <th></th>
            <th scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <input
                hx-target="this"
                hx-swap="outerHTML"
                type="checkbox"
                checked={meta.espn3}
                data-enabled={meta.espn3 ? 'true' : 'false'}
                hx-put={`/providers/espn/features/toggle/espn3`}
                hx-trigger="change"
                name="channel-enabled"
              />
            </td>
            <td>ESPN3</td>
          </tr>
          <tr>
            <td>
              <input
                hx-target="this"
                hx-swap="outerHTML"
                type="checkbox"
                checked={meta.sec_plus}
                data-enabled={meta.sec_plus ? 'true' : 'false'}
                hx-put={`/providers/espn/features/toggle/sec_plus`}
                hx-trigger="change"
                name="channel-enabled"
              />
            </td>
            <td>SEC Network+</td>
          </tr>
          <tr>
            <td>
              <input
                hx-target="this"
                hx-swap="outerHTML"
                type="checkbox"
                checked={meta.accnx}
                data-enabled={meta.accnx ? 'true' : 'false'}
                hx-put={`/providers/espn/features/toggle/accnx`}
                hx-trigger="change"
                name="channel-enabled"
              />
            </td>
            <td>ACC Network Extra</td>
          </tr>
        </tbody>
      </table>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/espn/reauth" hx-trigger="submit">
            <button id="espn-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
