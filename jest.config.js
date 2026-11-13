module.exports = {
  testMatch: [
    '**/test/unit/**/*.test.js'
  ],
  setupFiles: ['./test/setup.js'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|expo.*|@expo.*)/)'
  ],
  moduleFileExtensions: ['android.js', 'ios.js', 'native.js', 'js', 'jsx', 'json', 'node']
};
