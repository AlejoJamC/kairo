import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const sharedImportRules = [
  { group: ['@supabase/supabase-js'], message: 'Reach Supabase through @kairo/client-core.' },
  { group: ['@tamagui/*'], message: 'The styling engine is an implementation detail of @kairo/ui; use UiProvider and its exports.' },
  { group: ['lucide-react', 'react-icons', 'react-icons/*', '@heroicons/*'], message: 'Use Icon from @kairo/ui.' },
  { group: ['radix-ui', '@radix-ui/*', '@headlessui/*'], message: 'Use Popover, Dialog, Drawer, Menu, Tooltip or Switch from @kairo/ui.' },
  { group: ['class-variance-authority', 'clsx', 'tailwind-merge'], message: 'Variants belong in @kairo/ui; screens compose its exports.' },
]

const viewImportRules = [
  { group: ['@kairo/client-core/api-client'], message: 'Call an endpoint function from @kairo/client-core/endpoints.' },
  { group: ['@kairo/client-core/supabase'], message: 'Use @kairo/client-core/queries or a client-core hook.' },
]

export default defineConfig([
  globalIgnores(['dist', 'preview']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Architecture rules. Each one is active because its alternative already
  // exists. Violations that predate a rule are recorded in
  // eslint-suppressions.json; new code cannot add to them, and fixing one lets
  // `eslint --prune-suppressions` shrink the file.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/i18n/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: sharedImportRules }],
      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'Use an endpoint function from @kairo/client-core/endpoints.' },
        { name: 'localStorage', message: 'Use the storage port from @kairo/client-core/config.' },
      ],
      'no-restricted-syntax': ['error',
        {
          selector: "MemberExpression[object.name='window'][property.name=/^(location|localStorage|open)$/]",
          message: 'Use the navigation or storage port from @kairo/client-core/config.',
        },
        {
          selector: "MemberExpression[object.name='navigator'][property.name='clipboard']",
          message: 'Use the clipboard port from @kairo/client-core/config.',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'No inline style: compose @kairo/ui primitives and tokens instead.',
        },
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]",
          message: 'No color literals: use a token from @kairo/tokens.',
        },
      ],
    },
  },
  // Views never fetch and never build queries: data comes from client-core.
  {
    files: ['src/components/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...sharedImportRules, ...viewImportRules] }],
    },
  },
])
