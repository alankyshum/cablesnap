process.env.NODE_ENV = 'test';
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/architecture-*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true } }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
};
