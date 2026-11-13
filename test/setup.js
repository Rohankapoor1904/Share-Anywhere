global.__DEV__ = true;

try {
  require('react-native/jest/setup');
} catch (err) {
  // eslint-disable-next-line no-console
  console.info('Test setup fallback:', err.message);
}

// OS boundary interface mock for AsyncStorage in unit testing
// justified: AsyncStorage is a native bridge boundary module; unit tests exercise the business logic layer
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
