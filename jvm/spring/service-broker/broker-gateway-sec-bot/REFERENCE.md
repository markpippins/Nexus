# Broker Gateway SEC Bot — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `jasypt.encryptor.algorithm` | PBEWithMD5AndTripleDES | Encryption algorithm |
| `jasypt.encryptor.key-obtention-iterations` | 1000 | PBKDF2 iteration count |
| `jasypt.encryptor.pool-size` | 1 | Encryptor pool size |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `jasypt.encryptor.password` | — | Master encryption password (required, set as system property) |

## Commands

| Command | Description |
|---------|-------------|
| `mvn clean package` | Build the security module |
| `mvn test` | Run tests |
| `java -Djasypt.encryptor.password=your-secret -jar your-app.jar` | Run with encryption enabled |

## Troubleshooting

- **Decryption fails**: Verify the master password is correct and the algorithm matches the one used for encryption
- **Properties not decrypted**: Ensure `jasypt.encryptor.password` is set as a system property or environment variable
- **Algorithm warning**: PBEWithMD5AndTripleDES is a legacy algorithm — consider upgrading to AES-256-GCM for new projects
- **Client-side mismatch**: If decrypting in JavaScript, ensure the same algorithm, iterations, and salt handling are used
