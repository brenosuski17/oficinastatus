const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['**/node_modules/**', '**/dist/**', 'client/public/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['client/scripts/**/*.{js,mjs}', 'client/vite.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
