const pluginJs = require('@eslint/js')

const globals = require('globals')

module.exports = [
  pluginJs.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    files: ['**/*.js'],
    ignores: ['!**/node_modules/**'],
    rules: {
      'space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'ignore'
        }
      ]
    }
  }
]
