import type { HttpContext } from '@adonisjs/core/http'
import ProxyService from '#services/proxy_service'

/**
 * ProxyController handles all incoming requests and forwards them to broker-gateway
 */
export default class ProxyController {
    private proxyService: ProxyService

    constructor() {
        this.proxyService = new ProxyService()
    }

    /**
     * Handle any incoming request and proxy it to broker-gateway
     */
    async handle(ctx: HttpContext) {
        const result = await this.proxyService.forward(ctx)

        // If the result is a ServiceResponse (JSON), return it
        if (result && typeof result === 'object' && 'ok' in result) {
            return result
        }

        // Otherwise, the response was already sent by the proxy service
        return
    }

    /**
     * Health check endpoint for the proxy itself
     */
    async health() {
        return {
            status: 'UP',
            service: 'broker-gateway-proxy',
            timestamp: new Date().toISOString(),
        }
    }
}
