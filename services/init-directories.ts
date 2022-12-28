import path from 'path';
import fs from 'fs';

export const configPath = path.join(process.cwd(), 'config');

export const initDirectories = (): void => {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath);
  }

  if (!fs.existsSync(path.join(configPath, 'entries.db'))) {
    fs.writeFileSync(path.join(configPath, 'entries.db'), '');
  }

  if (!fs.existsSync(path.join(configPath, 'schedule.db'))) {
    fs.writeFileSync(path.join(configPath, 'schedule.db'), '');
  }
};
