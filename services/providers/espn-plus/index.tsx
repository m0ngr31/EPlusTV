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

espnplus.post('/category-filter', async c => {
  const body = await c.req.parseBody();
  const category_filter = body['espnplus-category-filter'];

  await db.providers.update(
    {name: 'espnplus'},
    {$set: {'meta.category_filter': category_filter}}
  );

  await removeEvents();
  await scheduleEvents();

  return c.html(
    <label>
      <span>
        Category Filter (<a href="https://www.espn.com/espnplus/browse/" target="_blank">examples</a>){' '}
        <span
          class="warning-red"
          data-tooltip="Making changes will break/invalidate existing ESPN+ scheduled recordings"
          data-placement="right"
        >
          **
        </span>
      </span>
      <fieldset role="group">
        <input
          type="text"
          placeholder="comma-separated list of categories to include, leave blank for all"
          value={category_filter.toString()}
          data-value={category_filter.toString()}
          name="espnplus-category-filter"
        />
        <button type="submit" id="category-filter-button">
          Save
        </button>
      </fieldset>
    </label>, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully saved category filter"}}`,
  });
});

espnplus.post('/title-filter', async c => {
  const body = await c.req.parseBody();
  const title_filter = body['espnplus-title-filter'];

  await db.providers.update(
    {name: 'espnplus'},
    {$set: {'meta.title_filter': title_filter}}
  );

  await removeEvents();
  await scheduleEvents();

  return c.html(
    <label>
      <span>
        Title Filter{' '}
        <span
          class="warning-red"
          data-tooltip="Making changes will break/invalidate existing ESPN+ scheduled recordings"
          data-placement="right"
        >
          **
        </span>
      </span>
      <fieldset role="group">
        <input
          type="text"
          placeholder="if specified, only include events with matching titles; supports regular expressions"
          value={title_filter.toString()}
          data-value={title_filter.toString()}
          name="espnplus-title-filter"
        />
        <button type="submit" id="title-filter-button">
          Save
        </button>
      </fieldset>
    </label>, 200, {
    'HX-Trigger': `{"HXToast":{"type":"success","body":"Successfully saved title filter"}}`,
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
