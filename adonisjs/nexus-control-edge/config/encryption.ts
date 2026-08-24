import { defineConfig, drivers } from '@adonisjs/core/encryption'
import env from '#start/env'

/**
 * The encryption module configuration.
 *
 * AdonisJS v7 moved encryption settings from config/app.ts into this
 * dedicated file. The `legacy` driver keeps compatibility with the
 * AdonisJS v6 encryption format (AES-256-CBC + HMAC SHA-256), so values
 * encrypted by the previous runtime (cookies, signed payloads) continue
 * to decrypt without forcing users to re-authenticate.
 *
 * The app key itself is unchanged — it comes from the same APP_KEY env
 * variable that config/app.ts exposes as `appKey`.
 */
export default defineConfig({
  default: 'app',
  list: {
    app: drivers.legacy({
      keys: [env.get('APP_KEY')],
    }),
  },
})
