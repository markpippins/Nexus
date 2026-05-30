# Security Plan — Encryption & Password Management

*Assessment of current encryption capabilities and what's needed for production readiness.*

## Current State: `broker-gateway-sec-bot`

Location: `jvm/spring/service-broker/broker-gateway-sec-bot/`

| Capability | Status | Details |
|-----------|--------|---------|
| Jasypt `StringEncryptor` bean | ✅ `@Primary`, pooled | `PooledPBEStringEncryptor`, injectable anywhere |
| In-flight message encryption | ✅ | `EncryptionService.encrypt()` / `decrypt()` on `ServiceRequest.params` and `ServiceResponse.data` Maps |
| REST endpoints | ✅ `POST /secbot/encrypt`, `/secbot/decrypt` | Delegates to `EncryptionService` |
| Properties file batch encryption | ✅ | `JasyptConfig.main()` utility — scans for `.password` keys, wraps values in `ENC(...)` |
| Algorithm | ⚠️ `PBEWithMD5AndTripleDES` | Weak — TODO in code: "replace with AES-256-GCM" |
| Key derivation | 1000 iterations | Low — modern minimum is 600,000+ (PBKDF2) or Argon2 |
| Master password source | `-D jasypt.encryptor.password` | JVM system property only |

## Gaps to Address

### 1. Automatic `ENC(...)` Decryption at Startup

**Current:** `JasyptConfig.main()` manually encrypts property values. Decryption requires Jasypt's auto-resolution to be enabled.

**Needed:** Add `@EnableEncryptableProperties` to broker-gateway's `@SpringBootApplication` class. Jasypt's Spring Boot starter automatically decrypts any `ENC(...)` value at property resolution time when this annotation is present.

```java
@SpringBootApplication
@EnableEncryptableProperties   // ← add this
public class BrokerGatewayApplication { ... }
```

After this, `admin.password=ENC(abc123...)` in `application.properties` is automatically decrypted at startup using the master password from the system property or environment variable.

### 2. Database Password Hashing

**Current:** `UserRegistration.identifier` stores plaintext passwords. No hashing exists anywhere.

**Needed:** Spring Security's `PasswordEncoder`:

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
}
```

- **Save:** `user.setIdentifier(passwordEncoder.encode(rawPassword))`
- **Verify:** `passwordEncoder.matches(rawPassword, user.getIdentifier())`
- Update `AdminUserSeeder`, `UserCreationService`, and `UserAccessService.validateUser()` to use the encoder.
- BCrypt produces a 60-character hash that fits in the existing `VARCHAR(255)` column.

### 3. Algorithm Upgrade

**Current:** `PBEWithMD5AndTripleDES` (168-bit effective, MD5 key derivation)

**Recommended:** `PBEWithHmacSHA256AndAES_256` via Jasypt:

```java
PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
encryptor.setAlgorithm("PBEWithHmacSHA256AndAES_256");
encryptor.setPassword(password);
encryptor.setKeyObtentionIterations(1000);
encryptor.setPoolSize(1);
```

Requires JCE Unlimited Strength policy (bundled in Java 11+ by default). Existing `ENC(...)` values would need re-encryption after the algorithm change.

### 4. Key Management

**Current:** Master password from `-D jasypt.encryptor.password` JVM flag.

**Recommended path:**
- **Immediate:** Also accept from environment variable `JASYPT_ENCRYPTOR_PASSWORD` (Jasypt already supports this — just document it)
- **Later:** File-based secret (`/etc/nexus/secret`), Docker secrets, or HashiCorp Vault

No code changes needed for environment variable support — Jasypt checks it automatically.

## Implementation Order

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Add `@EnableEncryptableProperties` to broker-gateway main class | 1 line |
| 2 | Add `BCryptPasswordEncoder` bean, update `AdminUserSeeder` and `UserCreationService` | ~15 lines |
| 3 | Update `UserAccessService.validateUser()` to use `PasswordEncoder.matches()` | ~5 lines |
| 4 | Upgrade algorithm to AES-256 in `JasyptConfig` | ~3 lines |
| 5 | Document environment variable for master password | README |
