# broker-gateway-sec-bot

This project provides security-related functionalities for the application, primarily focused on the encryption of sensitive configuration properties using Jasypt.

## Jasypt Configuration

The `JasyptConfig.java` class is the core of this module. It provides a `StringEncryptor` bean that can be used throughout the application to encrypt and decrypt properties. It also contains a `main` method utility for encrypting values in a properties file.

### Customizing Encryption

To ensure security and flexibility across different environments (dev, test, prod), you should not hardcode Jasypt configuration values.

1.  **Externalize Configuration:**
    Add the following properties to your `application.properties` file to control the encryption algorithm, iterations, and pool size.

    ```properties
    jasypt.encryptor.algorithm=PBEWithMD5AndTripleDES
    jasypt.encryptor.key-obtention-iterations=1000
    jasypt.encryptor.pool-size=1
    ```

2.  **Securely Provide the Master Password:**
    The master password is the most critical piece of information and **must not** be stored in plaintext in your source code or property files. The recommended approach is to provide it as a Java system property or an environment variable at runtime.

    The `stringEncryptor` bean is already configured to read the password from a system property named `jasypt.encryptor.password`.

    **Example (running from command line):**
    ```bash
    java -Djasypt.encryptor.password="your-very-secret-password" -jar your-application.jar
    ```

### Encrypting Properties

The `main` method in `JasyptConfig.java` can be run to encrypt all properties in a file that contain the word "password". Note that the hardcoded password `"blackops"` is used in this utility for convenience but should be changed or supplied dynamically in a secure production workflow.

## Client-Side (JavaScript/TypeScript) Integration

If you need to decrypt or encrypt data on a client-side application (e.g., using JavaScript/TypeScript) that is compatible with this project's Jasypt configuration, you will need a crypto library that can replicate the `PBEWithMD5AndTripleDES` algorithm. A common choice is `crypto-js`.

### Compatibility Requirements

To ensure the client-side encryption matches the server's, you must use the exact same parameters:

-   **Algorithm**: `PBEWithMD5AndTripleDES`.
-   **Password**: The same master password is required.
-   **Key Derivation Iterations**: Must be the same as the server (e.g., `1000`).
-   **Salt Handling**: The default Jasypt provider uses a random 8-byte salt for each encryption and prepends it to the encrypted output. Your client-side code must be able to parse this salt from the encrypted string to derive the correct decryption key.

### Conceptual Example with `crypto-js`

Here is a conceptual example of how to decrypt a Jasypt-encrypted string in JavaScript.

```javascript
import CryptoJS from 'crypto-js';

function decryptJasyptString(encryptedBase64String, password) {
  // 1. Decode the Base64 string.
  const encryptedData = CryptoJS.enc.Base64.parse(encryptedBase64String);

  // 2. Extract the 8-byte salt from the start of the data.
  const salt = CryptoJS.lib.WordArray.create(encryptedData.words.slice(0, 2));

  // 3. Extract the encrypted ciphertext which follows the salt.
  const encryptedPart = CryptoJS.lib.WordArray.create(encryptedData.words.slice(2));

  // 4. Derive the key using PBKDF2, configured to match Jasypt's PBEWithMD5...
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 192 / 32, // 192 bits for TripleDES
    iterations: 1000,
    hasher: CryptoJS.algo.MD5
  });

  // 5. Decrypt using TripleDES. Note that the mode (e.g., CBC) and padding must also match.
  // An IV would need to be extracted as well if using CBC mode.
  const decrypted = CryptoJS.TripleDES.decrypt({ ciphertext: encryptedPart }, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
```

## Security Warning

The algorithm `PBEWithMD5AndTripleDES` is considered a **legacy and cryptographically weak** standard.
-   **MD5** is vulnerable to hash collision attacks.
-   **TripleDES** has a small block size, making it susceptible to certain modern attacks.

For any new projects, it is **strongly recommended** to use a modern, secure algorithm like **AES-256-GCM** with a robust key derivation function such as **PBKDF2** or **Argon2**. This project uses a legacy algorithm for compatibility purposes, and you should consider upgrading if strong security is a critical requirement.
