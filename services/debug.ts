import path from 'path';
import fsExtra from 'fs-extra';

import {configPath} from './config';

export const debugPath = path.join(configPath, 'debug');

class Debug {
  enabled: boolean;

  constructor() {
    this.enabled = process.env.DEBUGGING?.toLowerCase() === 'true' ? true : false;
  }

  public saveRequestData = (data: any, provider: string, type: string): void => {
    if (!this.enabled) {
      return;
    }

    fsExtra.writeJSON(path.join(debugPath, `${provider}-${type}-${new Date().valueOf()}.json`), data, {
      spaces: 2,
    });
  };
}

export const debug = new Debug();
