import {FC} from 'hono/jsx';

import {usesLinear} from '@/services/misc-db-service';
import {IProviderChannel} from '@/services/shared-interfaces';

interface IBallyBodyProps {
  enabled: boolean;
  channels: IProviderChannel[];
}

export const BallyBody: FC<IBallyBodyProps> = async ({enabled, channels}) => {
  const useLinear = await usesLinear();

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
                  hx-put={`/providers/bally/channels/toggle/${c.id}`}
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
    </div>
  );
};
