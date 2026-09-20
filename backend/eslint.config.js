const js = require('@eslint/js')
const globals = require('globals')

/**
 * Konfigurasi ESLint (flat config) untuk backend Express.
 *
 * Tujuan: menangkap kesalahan yang paling sering terjadi di kode ini —
 * variabel tak terpakai, penggunaan variabel sebelum definisi, dan pola async
 * yang salah — tanpa memaksakan gaya penulisan yang memicu diff besar.
 * Aturan gaya diserahkan ke Prettier.
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'package-lock.json']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        performance: 'readonly'
      }
    },
    rules: {
      // Variabel tak terpakai: peringatan, bukan error, agar tidak memblokir CI
      // karena argumen yang sengaja tidak dipakai (mis. signature middleware).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^next$|^req$|^res$' }],
      'no-console': 'off', // logger memang memakai console
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': 'off'
    }
  }
]
