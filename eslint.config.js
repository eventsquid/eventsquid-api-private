import js from '@eslint/js';

const globals = {
  Buffer: 'readonly',
  URLSearchParams: 'readonly',
  console: 'readonly',
  global: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly'
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
];
