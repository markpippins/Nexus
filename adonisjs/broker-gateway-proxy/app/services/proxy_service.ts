import proxyConfig from '#config/proxy'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * ServiceResponse type matching the Spring broker-gateway response format
 */
export interface ServiceResponse<T = unknown> {
    ok: boolean
    data: T | null
    errors: Array<{ field: string; message: string }>
    requestId: string
    ts: string
    version: string
    service?: string
    operation?: string
    encrypt: boolean
}

/**
 * ProxyService handles forwarding HTTP requests to the upstream broker-gateway
 */
export default class ProxyService {
    private brokerGatewayUrl: string
    private timeout: number

    constructor() {
        this.brokerGatewayUrl = proxyConfig.brokerGatewayUrl
        this.timeout = proxyConfig.timeout
    }

    /**
     * Forward an HTTP request to the broker-gateway and return the response
     */
    async forward(ctx: HttpContext): Promise<Response | ServiceResponse> {
        const { request, response } = ctx
        const method = request.method()
        const path = request.url(true) // Include query string
        const targetUrl = `${this.brokerGatewayUrl}${path}`

        // Build headers, stripping unwanted ones
        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers())) {
            const lowerKey = key.toLowerCase()
            if (!proxyConfig.stripRequestHeaders.includes(lowerKey) && value) {
                headers.set(key, Array.isArray(value) ? value.join(', ') : value)
            }
        }

        // Add additional headers
        for (const [key, value] of Object.entries(proxyConfig.additionalHeaders)) {
            headers.set(key, value)
        }

        // Add client IP for rate limiting context
        const clientIp = request.ip()
        headers.set('X-Forwarded-For', clientIp)
        headers.set('X-Real-IP', clientIp)

        try {
            // Build fetch options
            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(this.timeout),
            }

            // Add body for non-GET/HEAD requests
            if (!['GET', 'HEAD'].includes(method)) {
                const contentType = request.header('content-type') || ''

                if (contentType.includes('application/json')) {
                    fetchOptions.body = JSON.stringify(request.body())
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    fetchOptions.body = new URLSearchParams(request.body() as Record<string, string>)
                } else {
                    // Raw body for other content types
                    fetchOptions.body = request.raw() as string
                }
            }

            // Make the request to broker-gateway
            const upstreamResponse = await fetch(targetUrl, fetchOptions)

            // Copy response headers
            for (const [key, value] of upstreamResponse.headers.entries()) {
                if (key.toLowerCase() !== 'transfer-encoding') {
                    response.header(key, value)
                }
            }

            // Set response status
            response.status(upstreamResponse.status)

            // Return the response body
            const contentType = upstreamResponse.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
                return (await upstreamResponse.json()) as ServiceResponse
            }

            // For non-JSON responses, stream the body
            const body = await upstreamResponse.text()
            response.send(body)
            return upstreamResponse

        } catch (error) {
            // Return error in ServiceResponse format (matching broker-gateway)
            const errorResponse = this.createErrorResponse(
                error instanceof Error ? error.message : 'Unknown error',
                path,
                method
            )

            response.status(error instanceof Error && error.name === 'TimeoutError' ? 504 : 502)
            return errorResponse
        }
    }

    /**
     * Create an error response in ServiceResponse format
     */
    private createErrorResponse(
        message: string,
        path: string,
        method: string
    ): ServiceResponse {
        return {
            ok: false,
            data: null,
            errors: [
                {
                    field: 'proxy',
                    message: `Upstream request failed: ${message}`,
                },
            ],
            requestId: this.generateRequestId(),
            ts: new Date().toISOString(),
            version: '1.0',
            service: 'broker-gateway-proxy',
            operation: `${method} ${path}`,
            encrypt: false,
        }
    }

    /**
     * Generate a unique request ID
     */
    private generateRequestId(): string {
        return `proxy-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    }
}
