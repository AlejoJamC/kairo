import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// The UI law for the admin app: screens compose @kairo/ui; they do not style.
export default defineConfig([
  globalIgnores(['.next', 'out', 'public', 'next-env.d.ts']),
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@tamagui/*'], message: 'The styling engine is an implementation detail of @kairo/ui; use UiProvider and its exports.' },
          { group: ['lucide-react', 'react-icons', 'react-icons/*', '@heroicons/*'], message: 'Use Icon from @kairo/ui.' },
          { group: ['radix-ui', '@radix-ui/*', '@headlessui/*'], message: 'Use Popover, Dialog, Drawer, Menu, Tooltip or Switch from @kairo/ui.' },
          { group: ['class-variance-authority', 'clsx', 'tailwind-merge'], message: 'Variants belong in @kairo/ui; screens compose its exports.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "JSXAttribute[name.name='style']", message: 'No inline style: compose @kairo/ui primitives and tokens instead.' },
        { selector: "JSXAttribute[name.name='className']", message: 'No CSS classes: compose @kairo/ui primitives and tokens instead.' },
        { selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]", message: 'No color literals: use a token from @kairo/tokens.' },
      ],
    },
  },
])
