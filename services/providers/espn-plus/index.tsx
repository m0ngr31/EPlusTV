import {Hono} from 'hono';

import { db } from '@/services/database';

import { Login } from './views/Login';
import { IProvider } from '@/services/shared-interfaces';
import { removeEntriesProvider, scheduleEntries } from '@/services/build-schedule';
import { espnHandler, IEspnPlusMeta, TESPNPlusTokens } from '@/services/espn-handler';
import { ESPNPlusBody } from './views/CardBody';

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
    await db.providers.update<IProvider>({name: 'espnplus'}, {$set: {enabled, tokens: {}}});
    removeEvents();

    return c.html(<></>);
  }

  await espnHandler.refreshInMarketTeams();

  return c.html(<Login />);
});

espnplus.put('/toggle-ppv', async c => {
  const body = await c.req.parseBody();
  const use_ppv = body['espnplus-ppv-enabled'] === 'on';

  const {enabled, tokens} = await db.providers.update<IProvider<TESPNPlusTokens, IEspnPlusMeta>>(
    {name: 'espnplus'},
    {$set: {'meta.use_ppv': use_ppv}},
    {returnUpdatedDocs: true},
  );

  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={enabled} tokens={tokens} />);
});

espnplus.put('/save-filters', async c => {
  const body = await c.req.parseBody();
  const category_filter = body['espnplus-category-filter'].toString();
  const title_filter = body['espnplus-title-filter'].toString();

  await db.providers.update(
    {name: 'espnplus'},
    {$set: {'meta.category_filter': category_filter, 'meta.title_filter': title_filter}}
  );

  await removeEvents();
  await scheduleEvents();

  return c.html(
    <div>
      <span>
        Category Filter
      </span>
      <fieldset role="group">
        <input
          type="text"
          placeholder="comma-separated list of categories to include, leave blank for all"
          value={category_filter}
          data-value={category_filter}
          name="espnplus-category-filter"
        />
      </fieldset>
      <span>
        Title Filter
      </span>
      <fieldset role="group">
        <input
          type="text"
          placeholder="if specified, only include events with matching titles; supports regular expressions"
          value={title_filter}
          data-value={title_filter}
          name="espnplus-title-filter"
        />
      </fieldset>
      <button type="submit" id="espnplus-save-filters-button">
        Save and Apply Filters
      </button>
    </div>, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully saved and applied filters"}}`,
  });
});

espnplus.put('/refresh-in-market-teams', async c => {
  const {zip_code, in_market_teams} = await espnHandler.refreshInMarketTeams();

  return c.html(
    <div>
      <pre>{in_market_teams} ({zip_code})</pre>
      <button id="espnplus-refresh-in-market-teams-button" disabled>Refresh In-Market Teams</button>
    </div>, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully refreshed in-market teams"}}`,
  });
});

espnplus.get('/login/check/:code', async c => {
  const code = c.req.param('code');

  const isAuthenticated = await espnHandler.authenticatePlusRegCode();

  if (!isAuthenticated) {
    return c.html(<Login code={code} />);
  }

  const {tokens} = await db.providers.update<IProvider<TESPNPlusTokens>>({name: 'espnplus'}, {$set: {enabled: true}}, {returnUpdatedDocs: true});

  // Kickoff event scheduler
  scheduleEvents();

  return c.html(<ESPNPlusBody enabled={true} tokens={tokens} open={true} />, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully enabled ESPN+"}}`,
  });
});

espnplus.put('/reauth', async c => {
  return c.html(<Login />);
});
