/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^firebase/firestore$': '<rootDir>/__mocks__/firebase-firestore.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};
