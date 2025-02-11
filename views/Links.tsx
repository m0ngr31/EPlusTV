import type {FC} from 'hono/jsx';

import {usesLinear} from '@/services/misc-db-service';

export interface ILinksProps {
  baseUrl: string;
}

export const Links: FC<ILinksProps> = async ({baseUrl}) => {
  const useLinear = await usesLinear();

  const xmltvUrl = `${baseUrl}/xmltv.xml`;
  const linearXmltvUrl = `${baseUrl}/linear-xmltv.xml`;
  const channelsUrl = `${baseUrl}/channels.m3u`;
  const linearChannelsUrl = `${baseUrl}/linear-channels.m3u`;

  return (
    <section>
      <h3>
        <span data-tooltip="Import these into your DVR client" data-placement="right">
          Links
        </span>
      </h3>
      <table class="striped">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Description</th>
            <th scope="col">Link</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Normal</td>
            <td>Insert into XMLTV Guide Data section</td>
            <td>
              <a href={xmltvUrl} class="secondary" target="_blank">
                {xmltvUrl}
              </a>
            </td>
          </tr>
          <tr>
            <td>Normal</td>
            <td>Insert into Source section</td>
            <td>
              <a href={channelsUrl} class="secondary" target="_blank">
                {channelsUrl}
              </a>
            </td>
          </tr>
          {useLinear && (
            <>
              <tr>
                <td>Linear</td>
                <td>
                  Insert into XMLTV Guide Data section
                  <p class="help-text">
                    <small
                      data-tooltip="Gracenote data is automatically added to M3U so Channels is able to map EPG data automatically."
                      data-placement="bottom"
                    >
                      Not needed for Channels DVR
                    </small>
                  </p>
                </td>
                <td>
                  <a href={linearXmltvUrl} class="secondary" target="_blank">
                    {linearXmltvUrl}
                  </a>
                </td>
              </tr>
              <tr>
                <td>Linear</td>
                <td>Insert into Source section</td>
                <td>
                  <a href={linearChannelsUrl} class="secondary" target="_blank">
                    {linearChannelsUrl}
                  </a>
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </section>
  );
};
