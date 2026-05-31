/*
|--------------------------------------------------------------------------
| Preload File - Service Registry Registration
|--------------------------------------------------------------------------
|
| This file is loaded automatically when the application starts.
| It handles registration with the service-registry and starts heartbeats.
|
*/

import ServiceRegistryClient from '#services/service_registry_client'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

const serviceRegistryClient = new ServiceRegistryClient()

// Start registration and heartbeat when the app is ready
app.ready(async () => {
    logger.info('Starting service-registry registration...')
    serviceRegistryClient.startHeartbeat()
})

// Graceful shutdown - deregister from service-registry
app.terminating(async () => {
    logger.info('Application shutting down, deregistering from service-registry...')
    await serviceRegistryClient.deregister()
})
