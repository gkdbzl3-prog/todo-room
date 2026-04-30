import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // 안 쓰는 변수 있다고 뭐라 하는 거 끄기
      'no-unused-vars': 'off',

      // useEffect dependency 배열 뭐라 하는 거 끄기
      'react-hooks/exhaustive-deps': 'off',

      // Vite React Refresh 관련 잔소리 끄기
      'react-refresh/only-export-components': 'off',
    },
  },
])