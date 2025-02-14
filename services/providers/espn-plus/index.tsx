import {Hono} from 'hono';

import {db} from '@/services/database';

import {Login} from './views/Login';
import {IProvider} from '@/services/shared-interfaces';
import {removeEntriesProvider, scheduleEntries} from '@/services/build-schedule';
import {espnHandler, IEspnPlusMeta, TESPNPlusTokens} from '@/services/espn-handler';
import {ESPNPlusBody} from './views/CardBody';

export const espnplus = new Hono().basePath('/espnplus');

const scheduleEvents = async () => {
  await espnHandler.getSchedule();
  await scheduleEntries();
};

const removeEvents = async () => {
  await removeEntriesProvider('espn');
};

espnplus.put('/toggle', async c => {
  const body = await c.req.parseBody();
  const enabled = body['espnplus-enabled'] === 'on';

  if (!enabled) {
    await db.providers.updateAsync<IProvider, any>({name: 'espnplus'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  await espnHandler.refreshInMarketTeams();

  return c.html(<Login />);
});

espnplus.put('/toggle-ppv', async c => {
  const body = await c.req.parseBody();
  const use_ppv = body['espnplus-ppv-enabled'] === 'on';

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TESPNPlusTokens, IEspnPlusMeta>, any>(
    {name: 'espnplus'},
    {$set: {'meta.use_ppv': use_ppv}},
    {returnUpdatedDocs: true},
  );
  const {enabled, tokens} = affectedDocuments as IProvider<TESPNPlusTokens, IEspnPlusMeta>;

  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={enabled} tokens={tokens} />);
});

espnplus.put('/refresh-in-market-teams', async c => {
  const {zip_code, in_market_teams} = await espnHandler.refreshInMarketTeams();

  return c.html(
    <div>
      <pre>
        {in_market_teams} ({zip_code})
      </pre>
      <button id="espnplus-refresh-in-market-teams-button" disabled>
        Refresh In-Market Teams
      </button>
    </div>,
    200,
    {
      'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully refreshed in-market teams"}}`,
    },
  );
});

espnplus.put('/toggle-studio', async c => {
  const body = await c.req.parseBody();
  const hide_studio = body['espnplus-hide-studio'] === 'on';

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TESPNPlusTokens, IEspnPlusMeta>, any>(
    {name: 'espnplus'},
    {$set: {'meta.hide_studio': hide_studio}},
    {returnUpdatedDocs: true},
  );

  return c.html(<></>);
});

espnplus.get('/login/check/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await espnHandler.authenticatePlusRegCode();

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {affectedDocuments} = await db.providers.updateAsync<IProvider<TESPNPlusTokens>, any>(
    {name: 'espnplus'},
    {$set: {enabled: true}},
    {returnUpdatedDocs: true},
  );
  const {tokens} = affectedDocuments as IProvider<TESPNPlusTokens, IEspnPlusMeta>;

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ESPN+"}}`,
  });
});

espnplus.put('/reauth', async c => {
  return c.html(<Login />);
});
