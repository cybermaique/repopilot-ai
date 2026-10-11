import tseslint from 'typescript-eslint';
import next from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/schema.d.ts',
      '**/next-env.d.ts',
      '**/drizzle/meta/**',
      'test-results/**',
      'playwright-report/**',
      '.local/**',
      '.tools/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...next.map((config) => ({ ...config, files: ['apps/web/**/*.{ts,tsx}'] })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
];
