/**
 * BEYU OS — shared ESLint configuration (flat config).
 *
 * Beyond ordinary hygiene, this encodes a few of the project's non-negotiable
 * rules so that violations are caught by tooling rather than by review:
 *
 *   - the forbidden "BEYU GROUP" name
 *   - floating-point arithmetic on money
 *   - frontend code importing a database driver directly
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.d.ts',
      'flutter/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Unused values are usually a mistake; an underscore marks intent.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` is permitted only where an optional dependency is loaded
      // dynamically, and must be justified in a comment.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'off', // needs type info; enabled per-project
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // --- BEYU OS specific -------------------------------------------------
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/BEYU\\s+GROUP/i]",
          message:
            'The parent organization is BEYU FAMILY TRUST. "BEYU GROUP" is forbidden throughout ' +
            'the codebase.',
        },
        {
          selector: "TemplateElement[value.raw=/BEYU\\s+GROUP/i]",
          message: 'The parent organization is BEYU FAMILY TRUST. "BEYU GROUP" is forbidden.',
        },
      ],
    },
  },

  // Money must never be represented as a float. Amounts are integer minor
  // units and percentages are integer basis points.
  {
    files: [
      '**/waterfall/**/*.ts',
      '**/capital/**/*.ts',
      '**/ownership/**/*.ts',
      '**/waterfall.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message:
            'Monetary rounding must be explicit and integer-based. Use applyBasisPoints() ' +
            'rather than floating-point rounding.',
        },
        { object: 'Number', property: 'parseFloat', message: 'Money is never a float.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money is integer minor units; parseFloat is never correct here.' },
      ],
    },
  },

  // Frontends never reach the database directly.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pg', message: 'Frontends must never access PostgreSQL directly. Use the API client.' },
            {
              name: '@electric-sql/pglite',
              message: 'Frontends must never access PostgreSQL directly. Use the API client.',
            },
          ],
          patterns: [
            {
              group: ['**/db/driver', '**/services/beyu-api/**'],
              message:
                'Frontends reach the backend only through @beyu/api-client over HTTP, never by ' +
                'importing server internals.',
            },
          ],
        },
      ],
    },
  },

  // The forbidden name must appear literally in exactly three places: the
  // validator that rejects it, the tests proving it is rejected, and this
  // configuration file. Everywhere else it is an error.
  {
    files: [
      'packages/types/src/organization.ts',
      'packages/types/src/organization.test.ts',
      'eslint.config.mjs',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Tests may be looser.
  {
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
