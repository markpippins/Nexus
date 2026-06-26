# Shared Core — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| (none) | — | Zero runtime configuration (library-only) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| (none) | — | No environment dependencies |

## Commands

| Command | Description |
|---------|-------------|
| `mvn clean compile` | Compile the core module |
| `mvn clean test` | Run unit tests |
| `mvn clean package` | Build the JAR |
| `mvn install` | Install locally for dependent projects |

## Troubleshooting

- **Incompatible adapter**: Ensure the correct adapter module (spring, helidon, quarkus) is on the classpath for the target framework
- **Legacy type still in use**: Deprecated com.angrysurfer.* types remain during migration — suppress deprecation warnings or migrate to com.aibizarchitect.*
- **Serialization issues**: Core models use standard Java serialization — ensure Jackson annotations are added via adapter modules if needed for JSON
