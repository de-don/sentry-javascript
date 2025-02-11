module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['suites/**/subject.js', 'suites/**/dist/*', 'scripts/**'],
  parserOptions: {
    sourceType: 'module',
  },
};
