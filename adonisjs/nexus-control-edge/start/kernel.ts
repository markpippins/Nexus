/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The consolidated control-plane edge is a JSON API: no session, no auth.
| Middleware stack: CORS + X-Nexus-Internal fleet-secret check
| (Security Pass Alpha, decision 22fe12bc) + bodyparser.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * The error handler is used to convert an exception
 * to an HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('#middleware/internal_header'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('#middleware/contract_shape'),
])
