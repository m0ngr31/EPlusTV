import jsdom from 'jsdom';

import {userAgent} from './user-agent';

const {JSDOM} = jsdom;

interface IDom {
  serialize(): string;
  window: {
    close(): void;
    MessageChannel: any;
  };
}

export const jsDomHelper = async (url: string): Promise<IDom> => {
  const dom: IDom = await JSDOM.fromURL(url, {
    pretendToBeVisual: true,
    resources: 'usable',
    runScripts: 'dangerously',
    userAgent,
    virtualConsole: new jsdom.VirtualConsole(),
  });

  dom.window.MessageChannel = class MessageChannel {
    public port1: any;
    public port2: any;

    constructor() {
      this.port1 = {};
      this.port2 = {};
    }
  };

  return dom;
};
