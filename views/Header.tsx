import type {FC} from 'hono/jsx';

import {version} from '../package.json';

export const Header: FC = () => (
  <header class="container">
    <div class="grid-container">
      <h1>
        <span class="title">
          <span>E+</span>
          <span class="title-bold">TV</span>
        </span>
      </h1>
      <div class="align-center">
        <p>v{version}</p>
      </div>
    </div>
  </header>
);
