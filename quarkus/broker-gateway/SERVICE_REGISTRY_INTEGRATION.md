# Quarkus Broker Gateway - Service Registry Integration

## Overview

Demonstrates **polyglot service registration**: Quarkus service registering with Spring Boot service-registry.

## How It Works

### Auto-Registration on Startup

```java
@ApplicationScoped
public class HostServerRegistrationService {
    void onStart(@Observes StartupEvent ev) {
        registerService();  // Register with service-registry
        startHeartbeats();  // Send periodic heartbeats
    }
}
```

### Configuration

```properties
service.registry.url=http://localhost:8085
service.host=localhost
registration.enabled=true
heartbeat.interval.seconds=30
```

## Testing

```bash
# Start service-registry
cd spring/service-registry && mvn spring-boot:run

# Start Quarkus gateway
cd quarkus/broker-gateway && ./mvnw quarkus:dev

# Verify registration
curl http://localhost:8085/api/v1/registry/services
```

## Benefits

✅ Polyglot service mesh (Spring Boot + Quarkus + Node.js + Python)  
✅ Automatic registration  
✅ Periodic heartbeats  
✅ Framework flexibility  

See [README](README.md) for full documentation.
