package com.aibizarchitect.nexus.v1.spring.secbot;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import org.jasypt.encryption.StringEncryptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EncryptionService")
class EncryptionServiceTest {

    @Mock
    private StringEncryptor stringEncryptor;

    @InjectMocks
    private EncryptionService encryptionService;

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — encrypt/decrypt with StringEncryptor")
    class GreenPath {

        @Test
        @DisplayName("encrypt: encrypts string values in map data")
        void encrypt_encryptsStrings() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(true);
            Map<String, Object> data = new HashMap<>();
            data.put("password", "secret123");
            data.put("username", "admin");
            response.setData(data);

            when(stringEncryptor.encrypt("secret123")).thenReturn("ENC(abc)");
            when(stringEncryptor.encrypt("admin")).thenReturn("ENC(xyz)");

            ServiceResponse result = encryptionService.encrypt(response);

            Map<String, Object> encrypted = (Map<String, Object>) result.getData();
            assertEquals("ENC(abc)", encrypted.get("password"));
            assertEquals("ENC(xyz)", encrypted.get("username"));
        }

        @Test
        @DisplayName("encrypt: skips non-string values")
        void encrypt_skipsNonStrings() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(true);
            Map<String, Object> data = new HashMap<>();
            data.put("count", 42);
            data.put("active", true);
            response.setData(data);

            ServiceResponse result = encryptionService.encrypt(response);

            Map<String, Object> encrypted = (Map<String, Object>) result.getData();
            assertEquals(42, encrypted.get("count"));
            assertEquals(true, encrypted.get("active"));
            verify(stringEncryptor, never()).encrypt(any());
        }

        @Test
        @DisplayName("decrypt: decrypts string values in params")
        void decrypt_decryptsStrings() {
            ServiceRequest request = new ServiceRequest();
            request.setEncrypt(true);
            Map<String, Object> params = new HashMap<>();
            params.put("password", "ENC(abc)");
            params.put("user", "admin");
            request.setParams(params);

            when(stringEncryptor.decrypt("ENC(abc)")).thenReturn("secret123");
            when(stringEncryptor.decrypt("admin")).thenReturn("cleartext");

            ServiceRequest result = encryptionService.decrypt(request);

            assertEquals("secret123", result.getParams().get("password"));
            assertEquals("cleartext", result.getParams().get("user"));
        }

        @Test
        @DisplayName("decrypt: skips non-string values")
        void decrypt_skipsNonStrings() {
            ServiceRequest request = new ServiceRequest();
            request.setEncrypt(true);
            Map<String, Object> params = new HashMap<>();
            params.put("count", 99);
            request.setParams(params);

            ServiceRequest result = encryptionService.decrypt(request);

            assertEquals(99, result.getParams().get("count"));
            verify(stringEncryptor, never()).decrypt(any());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("encrypt: encryption flag false — no encrypt")
        void encrypt_flagFalse() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(false);
            Map<String, Object> data = new HashMap<>();
            data.put("pwd", "secret");
            response.setData(data);

            ServiceResponse result = encryptionService.encrypt(response);

            assertEquals("secret", ((Map<?, ?>) result.getData()).get("pwd"));
            verify(stringEncryptor, never()).encrypt(any());
        }

        @Test
        @DisplayName("encrypt: null data — no NPE")
        void encrypt_nullData() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(true);
            response.setData(null);

            assertDoesNotThrow(() -> encryptionService.encrypt(response));
        }

        @Test
        @DisplayName("decrypt: null params — no NPE")
        void decrypt_nullParams() {
            ServiceRequest request = new ServiceRequest();
            request.setEncrypt(true);
            request.setParams(null);

            assertDoesNotThrow(() -> encryptionService.decrypt(request));
        }

        @Test
        @DisplayName("encrypt: data not a Map — returned as-is")
        void encrypt_nonMap() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(true);
            response.setData("plain-text");

            ServiceResponse result = encryptionService.encrypt(response);

            assertEquals("plain-text", result.getData());
            verify(stringEncryptor, never()).encrypt(any());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("encrypt: StringEncryptor exception propagates")
        void encrypt_encryptorException() {
            ServiceResponse response = new ServiceResponse();
            response.setEncrypt(true);
            Map<String, Object> data = new HashMap<>();
            data.put("pwd", "secret");
            response.setData(data);

            when(stringEncryptor.encrypt("secret"))
                    .thenThrow(new RuntimeException("Encryption failed"));

            assertThrows(RuntimeException.class,
                    () -> encryptionService.encrypt(response));
        }
    }
}
