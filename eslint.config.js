import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['test-results/', 'playwright-report/', 'public/app.js', 'public/worker.js', 'node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
];
