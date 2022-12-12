import findRemove from 'find-remove';

export const cleanupParts = (): void => {
  findRemove('tmp', {
    age: {seconds: 120},
    extensions: ['.ts', '.m3u8'],
  });
};
