package com.angrysurfer.shrapnel.exception;

import com.aibizarchitect.nexus.shrapnel.exception.ShrapnelException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Export Exceptions & Handler")
class ExportExceptionTests {

    @Nested
    @DisplayName("ExportConfigurationException")
    class ExportConfigurationExceptionTests {

        @Test @DisplayName("constructor with message and cause")
        void withMessageAndCause() {
            RuntimeException cause = new RuntimeException("root cause");
            ExportConfigurationException ex = new ExportConfigurationException("config error", cause);

            assertEquals("config error", ex.getMessage());
            assertEquals(cause, ex.getCause());
            assertTrue(ex instanceof RuntimeException);
        }

        @Test @DisplayName("null message allowed")
        void nullMessage() {
            ExportConfigurationException ex = new ExportConfigurationException(null, null);
            assertNull(ex.getMessage());
            assertNull(ex.getCause());
        }
    }

    @Nested
    @DisplayName("InvalidExportRequestException")
    class InvalidExportRequestExceptionTests {

        @Test @DisplayName("constructor with message")
        void withMessage() {
            InvalidExportRequestException ex = new InvalidExportRequestException("missing fields");

            assertEquals("missing fields", ex.getMessage());
            assertTrue(ex instanceof RuntimeException);
        }

        @Test @DisplayName("null message allowed")
        void nullMessage() {
            InvalidExportRequestException ex = new InvalidExportRequestException(null);
            assertNull(ex.getMessage());
        }
    }

    @Nested
    @DisplayName("ExportExceptionHandler")
    class ExportExceptionHandlerTests {

        @Test @DisplayName("has @ControllerAdvice annotation")
        void hasControllerAdvice() {
            assertNotNull(ExportExceptionHandler.class
                    .getAnnotation(ControllerAdvice.class));
        }

        @Test @DisplayName("handleInvalidExportRequest -> 400 BAD_REQUEST")
        void handleInvalidExportRequest() {
            ExportExceptionHandler handler = new ExportExceptionHandler();
            InvalidExportRequestException ex = new InvalidExportRequestException("bad request");

            ResponseEntity<String> response = handler.handleInvalidExportRequest(ex);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertTrue(response.getBody().contains("bad request"));
        }

        @Test @DisplayName("handleRequestProcessingException -> 500 INTERNAL_SERVER_ERROR")
        void handleRequestProcessingException() {
            ExportExceptionHandler handler = new ExportExceptionHandler();
            ExportConfigurationException ex = new ExportConfigurationException("config fail", null);

            ResponseEntity<String> response = handler.handleRequestProcessingException(ex);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertTrue(response.getBody().contains("config fail"));
        }

        @Test @DisplayName("ShrapnelException -> 500 via handleRequestProcessingException")
        void shrapnelException_500() {
            ExportExceptionHandler handler = new ExportExceptionHandler();
            ShrapnelException ex = new ShrapnelException("shrapnel error", null);

            ResponseEntity<String> response = handler.handleRequestProcessingException(ex);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertTrue(response.getBody().contains("shrapnel error"));
        }
    }
}
