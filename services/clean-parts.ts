import findRemove from 'find-remove';

export const cleanupParts = () => {
  findRemove('tmp', {
    age: { seconds: 120 },
    extensions: ['.ts', '.m3u8'],
  });
};
