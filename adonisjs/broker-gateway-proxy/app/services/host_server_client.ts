import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

/**
 * HostServerClient handles registration and heartbeat with the service-registry registry
 */
export default class HostServerClient {
    private hostServerUrl: string
    private serviceName: string
    private serviceHost: string
    private servicePort: number
    private heartbeatIntervalMs: number
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null
    private isRegistered = false

    constructor() {
        this.hostServerUrl = env.get('HOST_SERVER_URL')
        this.serviceName = env.get('SERVICE_NAME')
        this.serviceHost = env.get('SERVICE_HOST')
        this.servicePort = env.get('SERVICE_PORT')
        this.heartbeatIntervalMs = env.get('HEARTBEAT_INTERVAL_MS')
    }

    /**
     * Register this service with the service-registry registry
     */
    async register(): Promise<boolean> {
        const registrationUrl = `${this.hostServerUrl}/api/v1/registry/register`

        const payload = {
            serviceName: this.serviceName,
            endpoint: `http://${this.serviceHost}:${this.servicePort}`,
            port: this.servicePort,
            framework: 'AdonisJS',
            version: '1.0.0',
            operations: ['proxy', 'rate-limit'],
            healthCheck: `http://${this.serviceHost}:${this.servicePort}/health`,
        }

        try {
            const response = await fetch(registrationUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            if (response.ok) {
                this.isRegistered = true
                logger.info(`Registered with service-registry: ${this.serviceName}`)
                return true
            } else {
                const errorText = await response.text()
                logger.warn(`Failed to register with service-registry: ${response.status} - ${errorText}`)
                return false
            }
        } catch (error) {
            logger.warn(`Could not connect to service-registry at ${registrationUrl}: ${error}`)
            return false
        }
    }

    /**
     * Send heartbeat to keep registration alive
     */
    async heartbeat(): Promise<boolean> {
        if (!this.isRegistered) {
            // Try to register first
            return this.register()
        }

        const heartbeatUrl = `${this.hostServerUrl}/api/v1/registry/heartbeat/${this.serviceName}`

        try {
            const response = await fetch(heartbeatUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    host: this.serviceHost,
                    port: this.servicePort,
                }),
            })

            if (response.ok) {
                logger.debug(`Heartbeat sent for ${this.serviceName}`)
                return true
            } else {
                // Re-register if heartbeat fails
                logger.warn(`Heartbeat failed, attempting re-registration`)
                this.isRegistered = false
                return this.register()
            }
        } catch (error) {
            logger.warn(`Heartbeat error: ${error}`)
            this.isRegistered = false
            return false
        }
    }

    /**
     * Start the heartbeat interval
     */
    startHeartbeat(): void {
        if (this.heartbeatTimer) {
            return
        }

        // Initial registration
        this.register()

        // Start interval for heartbeats
        this.heartbeatTimer = setInterval(() => {
            this.heartbeat()
        }, this.heartbeatIntervalMs)

        logger.info(`Heartbeat started with interval ${this.heartbeatIntervalMs}ms`)
    }

    /**
     * Stop the heartbeat interval
     */
    stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
            logger.info('Heartbeat stopped')
        }
    }

    /**
     * Deregister from service-registry (call on shutdown)
     */
    async deregister(): Promise<void> {
        this.stopHeartbeat()

        if (!this.isRegistered) {
            return
        }

        const deregisterUrl = `${this.hostServerUrl}/api/v1/registry/deregister/${this.serviceName}`

        try {
            await fetch(deregisterUrl, {
                method: 'POST',
            })
            logger.info(`Deregistered ${this.serviceName} from service-registry`)
        } catch (error) {
            logger.warn(`Failed to deregister: ${error}`)
        }

        this.isRegistered = false
    }
}
