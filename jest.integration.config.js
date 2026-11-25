module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,
  testMatch: [
    '**/test/integration/**/*.test.js'
  ],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'json', 'node']
};

