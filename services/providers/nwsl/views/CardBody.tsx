import {FC} from 'hono/jsx';

import {TNwslTokens} from '@/services/nwsl-handler';
import {usesLinear} from '@/services/misc-db-service';
import {IProviderChannel} from '@/services/shared-interfaces';

interface INwslBodyProps {
  enabled: boolean;
  tokens?: TNwslTokens;
  open?: boolean;
  channels: IProviderChannel[];
}

export const NwslBody: FC<INwslBodyProps> = async ({enabled, tokens, open, channels}) => {
  const useLinear = await usesLinear();

  const parsedTokens = JSON.stringify(tokens, undefined, 2);

  if (!enabled) {
    return <></>;
  }

  return (
    <div hx-swap="outerHTML" hx-target="this">
      <summary>
        <span data-tooltip="These are only enabled with Dedicated Linear Channels enabled" data-placement="right">
          Linear Channels
        </span>
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
                  disabled={!useLinear}
                  hx-put={`/providers/nwsl/channels/toggle/${c.id}`}
                  hx-trigger="change"
                  name="channel-enabled"
                />
              </td>
              <td>
                {!c.tmsId ? (
                  <>
                    {c.name}
                    <span class="warning-red" data-tooltip="Non-Gracenote channel" data-placement="right">
                      *
                    </span>
                  </>
                ) : (
                  <>{c.name}</>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details open={open}>
        <summary>Tokens</summary>
        <div>
          <pre>{parsedTokens}</pre>
          <form hx-put="/providers/nwsl/reauth" hx-trigger="submit">
            <button id="nwsl-reauth">Re-Authenticate</button>
          </form>
        </div>
      </details>
    </div>
  );
};
