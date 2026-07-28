package com.angrysurfer.shrapnel.validation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.angrysurfer.shrapnel.exception.InvalidExportRequestException;
import com.angrysurfer.shrapnel.factory.IExportFactory;
import com.angrysurfer.shrapnel.service.ExportsService;
import com.angrysurfer.shrapnel.service.Request;

@ExtendWith(MockitoExtension.class)
@DisplayName("RequestValidator")
class RequestValidatorTest {

    @Mock
    private ExportsService exportsService;

    @Mock
    private IExportFactory exportFactory;

    @InjectMocks
    private RequestValidator validator;

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    private Request validRequest() {
        Request r = new Request();
        r.setName("test-export");
        r.setFileType("csv");
        return r;
    }

    // ═══════════════════════════════════════════════════════════════
    // Green Path — Valid requests pass validation
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Green Path — Valid requests")
    class GreenPath {

        @Test
        @DisplayName("Valid CSV request with matching factory passes all checks")
        void validCsvRequest_passes() {
            Request request = validRequest();
            when(exportsService.getFactory(any(Request.class))).thenReturn(exportFactory);

            assertDoesNotThrow(() -> validator.validate(request));
        }

        @Test
        @DisplayName("Valid PDF request passes all checks")
        void validPdfRequest_passes() {
            Request request = validRequest();
            request.setFileType("pdf");
            when(exportsService.getFactory(any(Request.class))).thenReturn(exportFactory);

            assertDoesNotThrow(() -> validator.validate(request));
        }

        @Test
        @DisplayName("Valid XLSX request passes all checks")
        void validXlsxRequest_passes() {
            Request request = validRequest();
            request.setFileType("xlsx");
            when(exportsService.getFactory(any(Request.class))).thenReturn(exportFactory);

            assertDoesNotThrow(() -> validator.validate(request));
        }

        @Test
        @DisplayName("Request with filter criteria passes validation")
        void requestWithFilterCriteria_passes() {
            Request request = validRequest();
            request.getFilterCriteria().put("status", "active");
            when(exportsService.getFactory(any(Request.class))).thenReturn(exportFactory);

            assertDoesNotThrow(() -> validator.validate(request));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Orange Path — Invalid but not catastrophic
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Orange Path — Invalid file types and missing factories")
    class OrangePath {

        @Test
        @DisplayName("Unknown file type 'html' is rejected with descriptive message")
        void unknownFileType_rejected() {
            Request request = validRequest();
            request.setFileType("html");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Unknown file extension"),
                    "Message should mention unknown file extension: " + ex.getMessage());
            assertTrue(ex.getMessage().contains("html"),
                    "Message should include the rejected type: " + ex.getMessage());
        }

        @Test
        @DisplayName("File type 'XML' (uppercase) is treated case-insensitively — rejected")
        void fileType_caseInsensitive_rejected() {
            Request request = validRequest();
            request.setFileType("XML");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Unknown file extension"));
        }

        @Test
        @DisplayName("No factory found for valid file type + name — rejected")
        void noFactoryFound_rejected() {
            Request request = validRequest();
            when(exportsService.getFactory(any(Request.class))).thenReturn(null);

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("No factory found"),
                    "Message should mention missing factory: " + ex.getMessage());
            assertTrue(ex.getMessage().contains(request.getName()),
                    "Message should include the export name: " + ex.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Red Path — Null, blank, and malformed inputs
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Red Path — Null, blank, and attack payloads")
    class RedPath {

        @Test
        @DisplayName("Null request throws IllegalArgumentException from Jakarta Validator — no null guard")
        void nullRequest_throwsIllegalArgumentException() {
            // GAP: validate(null) hits Jakarta Validator.validate(null) first,
            // which throws IllegalArgumentException per Bean Validation spec.
            // There is no null guard on the request parameter before the validator call.
            assertThrows(IllegalArgumentException.class,
                    () -> validator.validate(null));
        }

        @Test
        @DisplayName("Null name fails Jakarta Bean Validation — @NotBlank violation")
        void nullName_validationFails() {
            Request request = new Request();
            request.setFileType("csv");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Invalid DBExport Request"),
                    "Message should indicate invalid request: " + ex.getMessage());
        }

        @Test
        @DisplayName("Blank name fails Jakarta Bean Validation — @NotBlank violation")
        void blankName_validationFails() {
            Request request = new Request();
            request.setName("   ");
            request.setFileType("csv");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Invalid DBExport Request"));
        }

        @Test
        @DisplayName("Too-short file type fails @Size(min=3) — 'ab' rejected")
        void tooShortFileType_rejected() {
            Request request = validRequest();
            request.setFileType("ab");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Invalid DBExport Request"));
        }

        @Test
        @DisplayName("Too-long file type fails @Size(max=4) — 'abcde' rejected")
        void tooLongFileType_rejected() {
            Request request = validRequest();
            request.setFileType("abcde");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Invalid DBExport Request"));
        }

        @Test
        @DisplayName("SQL injection in name is passed to factory lookup — not sanitized")
        void sqlInjectionInName_passedToFactory() {
            Request request = validRequest();
            request.setName("test'; DROP TABLE users;--");
            when(exportsService.getFactory(any(Request.class))).thenReturn(null);

            // Should fail with "No factory found" — the SQL injection is
            // treated as the export name, not sanitized.
            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("No factory found"));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Silent Failure — Regression locks, error message format
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Silent Failure — Regression locks and error format")
    class SilentFailure {

        @Test
        @DisplayName("Unknown file type error message format is stable")
        void unknownFileType_messageFormat() {
            Request request = validRequest();
            request.setFileType("xml");

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertEquals("Unknown file extension: xml.", ex.getMessage(),
                    "Error message format must not change — callers may parse it");
        }

        @Test
        @DisplayName("No factory error message format is stable")
        void noFactory_messageFormat() {
            Request request = validRequest();
            when(exportsService.getFactory(any(Request.class))).thenReturn(null);

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertEquals("No factory found for test-export.", ex.getMessage(),
                    "Error message format must not change");
        }

        @Test
        @DisplayName("Validation order: Bean Validation before file type before factory check")
        void validationOrder_preserved() {
            // GAP: if name is blank AND fileType is invalid, only the first
            // failure surfaces. This test documents the current order:
            // 1. Jakarta Bean Validation
            // 2. File type check
            // 3. Factory lookup
            Request request = new Request();
            // no name, no fileType — both fail bean validation

            InvalidExportRequestException ex = assertThrows(
                    InvalidExportRequestException.class,
                    () -> validator.validate(request));

            assertTrue(ex.getMessage().contains("Invalid DBExport Request"),
                    "Bean Validation should fire first: " + ex.getMessage());
        }
    }
}
