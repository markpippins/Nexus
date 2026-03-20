import env from '#start/env'

const proxyConfig = {
    // Upstream broker-gateway URL
    brokerGatewayUrl: env.get('BROKER_GATEWAY_URL', 'http://localhost:8081'),

    // Request timeout in milliseconds
    timeout: env.get('PROXY_TIMEOUT', 30000),

    // Headers to strip from proxied requests
    stripRequestHeaders: ['host', 'connection'],

    // Headers to add to proxied requests
    additionalHeaders: {
        'X-Forwarded-By': 'broker-gateway-proxy',
    },
}

export default proxyConfig
