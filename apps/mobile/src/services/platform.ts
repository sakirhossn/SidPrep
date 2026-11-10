export const getPlatformOS = (): 'android' | 'ios' | 'web' | 'node' => {
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'test') {
    return 'node';
  }
  try {
    const { Platform } = require('react-native');
    return Platform.OS;
  } catch {
    return 'node';
  }
};

export const getPlatformVersion = (): string => {
  try {
    const { Platform } = require('react-native');
    return String(Platform.Version ?? '');
  } catch {
    return '';
  }
};
