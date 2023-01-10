import path from 'path';
import fs from 'fs';

const slatePlaylist: string = fs.readFileSync(
  path.join(process.cwd(), 'slate/starting/starting.m3u8'),
  {encoding: 'utf-8'},
);

const reSegment = /(.*).ts$/gm;

export const getSlate = (uri: string): string =>
  slatePlaylist.replace(reSegment, `${uri}/channels/starting/$1.ts`);

export const USE_SLATE =
  process.env.USE_SLATE && process.env.USE_SLATE.toLowerCase() !== 'false'
    ? true
    : false;
