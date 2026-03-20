/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const ProxyController = () => import('#controllers/proxy_controller')

// Health check endpoint for the proxy itself
router.get('/health', [ProxyController, 'health'])

// Proxy all other requests to broker-gateway
// This catch-all route should be last
router.any('/*', [ProxyController, 'handle'])
