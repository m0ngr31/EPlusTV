const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMnumCharsOPQRSTUVWXYZ0123456789';

export const generateRandom = (numChars = 8, namespace?: string) => {
  let nameSpaceFull = '';

  const randomId = Array(numChars)
    .join()
    .split(',')
    .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
    .join('');

  if (namespace && namespace.length) {
    nameSpaceFull = `${namespace}-`;
  }

  return `${nameSpaceFull}${randomId}`;
};
