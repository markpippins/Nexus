import * as http from 'http';
import * as https from 'https';
import * as winston from 'winston';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

interface ServiceConfig {
  name: string;
  healthEndpoint: string;
  port: number;
  protocol: 'http' | 'https';
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface HealthResponse {
  status: 'UP' | 'DOWN';
  service: string;
  timestamp: string;
  details?: any;
  error?: string;
}

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'circuit-breaker' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) => `${info.timestamp} ${info.level} [${info.service}] ${info.message}`
        )
      ),
    }),
  ],
});

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(
    private service: ServiceConfig,
    private config: CircuitBreakerConfig
  ) {}

  async checkHealth(): Promise<{ available: boolean; response?: HealthResponse; error?: string }> {
    const now = Date.now();

    // If circuit is OPEN and reset timeout hasn't passed, return unavailable
    if (this.state === CircuitState.OPEN && now < this.nextAttemptTime) {
      logger.debug('Circuit breaker still open', {
        service: this.service.name,
        nextAttemptInMs: Math.ceil((this.nextAttemptTime - now) / 1000) * 1000
      });
      return {
        available: false,
        error: `Circuit breaker OPEN for ${this.service.name}. Next attempt in ${Math.ceil((this.nextAttemptTime - now) / 1000)}s`
      };
    }

    // If circuit is OPEN but reset timeout has passed, move to HALF_OPEN
    if (this.state === CircuitState.OPEN && now >= this.nextAttemptTime) {
      this.state = CircuitState.HALF_OPEN;
      logger.info('Circuit breaker moved to HALF_OPEN state', { service: this.service.name });
    }

    try {
      const response = await this.makeHealthRequest();

      if (response.status === 'UP') {
        this.onSuccess();
        logger.debug('Health check passed', { service: this.service.name });
        return { available: true, response };
      } else {
        this.onFailure();
        logger.warn('Health check failed', {
          service: this.service.name,
          status: response.status,
          details: response.details
        });
        return { available: false, response, error: 'Service reported DOWN status' };
      }
    } catch (error) {
      this.onFailure();
      logger.error('Health check error', {
        service: this.service.name,
        error: (error as Error).message
      });
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async makeHealthRequest(): Promise<HealthResponse> {
    return new Promise((resolve, reject) => {
      const client = this.service.protocol === 'https' ? https : http;
      const url = `${this.service.protocol}://localhost:${this.service.port}${this.service.healthEndpoint}`;
      
      const req = client.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response: HealthResponse = JSON.parse(data);
            resolve(response);
          } catch (parseError) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check request timed out'));
      });
    });
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      logger.info('Circuit breaker moved to CLOSED state', { service: this.service.name });
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      logger.warn('Circuit breaker moved to OPEN state', {
        service: this.service.name,
        failureCount: this.failureCount,
        resetTimeoutMs: this.config.resetTimeout
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}

// Service configurations
const SERVICES: ServiceConfig[] = [
  {
    name: 'image-server',
    healthEndpoint: '/health',
    port: 8081,
    protocol: 'http'
  },
  {
    name: 'file-system-server',
    healthEndpoint: '/health',
    port: 4040,
    protocol: 'http'
  },
  {
    name: 'broker-gateway',
    healthEndpoint: '/health',
    port: 8080, // Assuming default Spring Boot port
    protocol: 'http'
  }
];

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,      // Open circuit after 3 consecutive failures
  resetTimeout: 30000,      // Wait 30 seconds before attempting to close circuit
  monitoringPeriod: 10000   // Check health every 10 seconds
};

class HealthMonitor {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    // Initialize circuit breakers for all services
    SERVICES.forEach(service => {
      this.circuitBreakers.set(service.name, new CircuitBreaker(service, CIRCUIT_BREAKER_CONFIG));
    });
  }

  async checkAllServices(): Promise<Map<string, any>> {
    const results = new Map();

    for (const [serviceName, circuitBreaker] of this.circuitBreakers) {
      const result = await circuitBreaker.checkHealth();
      results.set(serviceName, {
        ...result,
        circuitState: circuitBreaker.getState(),
        failureCount: circuitBreaker.getFailureCount()
      });
    }

    return results;
  }

  async checkService(serviceName: string): Promise<any> {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    if (!circuitBreaker) {
      throw new Error(`Service ${serviceName} not found`);
    }

    const result = await circuitBreaker.checkHealth();
    return {
      ...result,
      circuitState: circuitBreaker.getState(),
      failureCount: circuitBreaker.getFailureCount()
    };
  }

  startMonitoring(): void {
    logger.info('Starting health monitoring...');

    setInterval(async () => {
      const results = await this.checkAllServices();

      logger.info('Health check results', { timestamp: new Date().toISOString() });
      for (const [serviceName, result] of results) {
        const status = result.available ? 'UP' : 'DOWN';
        const circuit = result.circuitState;
        logger.info('Service status', {
          service: serviceName,
          status,
          circuitState: circuit,
          failureCount: result.failureCount
        });

        if (!result.available && result.error) {
          logger.error('Service error details', {
            service: serviceName,
            error: result.error
          });
        }
      }
    }, CIRCUIT_BREAKER_CONFIG.monitoringPeriod);
  }
}

// Export for use in other modules
export { HealthMonitor, CircuitBreaker, CircuitState };

// CLI usage
if (require.main === module) {
  const monitor = new HealthMonitor();

  // Check all services once
  monitor.checkAllServices().then(results => {
    logger.info('Initial health check results:', { timestamp: new Date().toISOString() });
    for (const [serviceName, result] of results) {
      logger.info('Service result', { service: serviceName, result });
    }

    // Start continuous monitoring
    monitor.startMonitoring();
  }).catch(error => {
    logger.error('Failed to perform initial health check', { error: error.message });
  });
}