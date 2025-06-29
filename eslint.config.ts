import js from '@eslint/js';
import typescriptParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import eslintCommentsPlugin from 'eslint-plugin-eslint-comments';
import prettierPlugin from 'eslint-plugin-prettier';
import promisePlugin from 'eslint-plugin-promise';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        // Build-time constants
        __DEV__: 'readonly',
        __LIB__: 'readonly',
        __LIB_VERSION__: 'readonly',
        // Browser globals that are safe to use
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      prettier: prettierPlugin,
      'eslint-comments': eslintCommentsPlugin,
      'simple-import-sort': simpleImportSort,
      promise: promisePlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'eslint-comments/disable-enable-pair': [
        'error',
        { allowWholeFile: true },
      ],
      'no-unused-vars': 'off', // TypeScript handles this
      'no-undef': 'off', // TypeScript handles this
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message:
            'Use a different approach to access browser APIs. Consider using a utility function or checking for window availability.',
        },
        {
          name: 'document',
          message:
            'Use a different approach to access DOM APIs. Consider using a utility function or checking for document availability.',
        },
        {
          name: 'navigator',
          message:
            'Use a different approach to access navigator APIs. Consider using a utility function or checking for navigator availability.',
        },
        {
          name: 'location',
          message:
            'Use a different approach to access location APIs. Consider using a utility function or checking for location availability.',
        },
        {
          name: 'localStorage',
          message:
            'Use a different approach to access localStorage. Consider using a utility function or checking for localStorage availability.',
        },
        {
          name: 'sessionStorage',
          message:
            'Use a different approach to access sessionStorage. Consider using a utility function or checking for sessionStorage availability.',
        },
      ],
      'prettier/prettier': 'error',
      'promise/always-return': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: [
      'test-utils/**/*.{js,ts,tsx}',
      '**/test/**/*.{js,ts,tsx}',
      '**/*.test.{js,ts,tsx}',
      'packages/altertable-snippet/**/*.{js,ts,tsx}',
    ],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: [
      '**/*/dist/*',
      '**/*/build/*',
      '**/*/out/*',
      '**/*/lib/*',
      '**/*/coverage/*',
      '**/*/.next/*',
      '**/*/node_modules/*',
    ],
  },
]);
