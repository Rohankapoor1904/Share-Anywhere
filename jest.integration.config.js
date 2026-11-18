module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/integration/**/*.test.js'
  ],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'json', 'node']
};

