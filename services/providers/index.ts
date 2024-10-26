import {Hono} from 'hono';

import {cbs} from './cbs-sports';
import {mw} from './mw';
import {paramount} from './paramount';
import {flosports} from './flosports';
import {mlbtv} from './mlb';
import {fox} from './fox';
import {nesn} from './nesn';
import {b1g} from './b1g';
import {nfl} from './nfl';
import {espn} from './espn';
import {espnplus} from './espn-plus';
import {gotham} from './gotham';

export const providers = new Hono().basePath('/providers');

providers.route('/', cbs);
providers.route('/', mw);
providers.route('/', paramount);
providers.route('/', flosports);
providers.route('/', mlbtv);
providers.route('/', fox);
providers.route('/', nesn);
providers.route('/', b1g);
providers.route('/', nfl);
providers.route('/', espn);
providers.route('/', espnplus);
providers.route('/', gotham);
