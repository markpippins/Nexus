# Broker Gateway SEC Bot — Specification

## Functional Requirements

- Encrypt sensitive configuration properties using Jasypt PBEWithMD5AndTripleDES
- Provide a StringEncryptor bean for Spring Boot applications to use throughout
- Support runtime decryption of encrypted properties on application startup
- Provide a utility main method for batch-encrypting properties in configuration files
- Externalize all encryption configuration (algorithm, iterations, pool size) to properties

## Non-Functional Requirements

- Master password must never be stored in plaintext — provided via system property or environment variable
- Default algorithm: PBEWithMD5AndTripleDES (legacy, for compatibility)
- Salt: random 8-byte salt prepended to encrypted output
- Key derivation: PBKDF2 with configurable iterations

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| (Library) | StringEncryptor.encrypt | Encrypt a plaintext value |
| (Library) | StringEncryptor.decrypt | Decrypt an encrypted value |
| (CLI) | main() | Batch-encrypt all password-containing properties in a file |

## Data Model

- EncryptedProperty: plainText (String), encryptedValue (String), algorithm (String), iterations (Integer)
- JasyptConfig: algorithm (String), iterations (Integer), poolSize (Integer), password (String)
