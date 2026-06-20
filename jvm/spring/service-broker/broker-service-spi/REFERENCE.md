# Broker Service SPI — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `broker.spi.scan-packages` | — | Additional packages to scan for SPI implementations |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| (none) | — | Configure via META-INF/services files |

## Commands

| Command | Description |
|---------|-------------|
| `mvn clean compile` | Compile the SPI module |
| `mvn test` | Run unit tests |
| `mvn package` | Build the JAR |

## Troubleshooting

- **Provider not loaded**: Verify the META-INF/services file exists at the correct path with the fully qualified implementation class name
- **ClassNotFoundException**: Ensure the provider JAR is on the classpath
- **Interface incompatibility**: The SPI interface has changed — rebuild all provider implementations against the latest SPI version
- **Multiple providers**: When multiple providers support the same operation, priority ordering applies — check the ServiceDefinition priority
