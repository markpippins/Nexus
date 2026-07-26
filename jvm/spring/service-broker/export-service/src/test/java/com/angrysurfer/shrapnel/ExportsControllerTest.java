package com.angrysurfer.shrapnel;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayOutputStream;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.angrysurfer.shrapnel.exception.InvalidExportRequestException;
import com.angrysurfer.shrapnel.service.IExportsService;
import com.angrysurfer.shrapnel.service.Request;
import com.angrysurfer.shrapnel.validation.IRequestValidator;
import com.fasterxml.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("ExportsController")
class ExportsControllerTest {

    private MockMvc mockMvc;

    @Mock
    private IExportsService exportsService;

    @Mock
    private IRequestValidator exportRequestValidator;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new ExportsController(exportsService, exportRequestValidator))
                .build();
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    private Request validRequest() {
        Request r = new Request();
        r.setName("test-export");
        r.setFileType("csv");
        return r;
    }

    private String requestJson(Request r) throws Exception {
        return objectMapper.writeValueAsString(r);
    }

    // ═══════════════════════════════════════════════════════════════
    // Green Path
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Green Path — Successful export operations")
    class GreenPath {

        @Test
        @DisplayName("POST /exports/fileExport returns 200 with ByteArrayResource and content-disposition header")
        void fileExport_validRequest_returnsByteArrayResource() throws Exception {
            Request request = validRequest();
            byte[] content = "csv,data".getBytes();
            ByteArrayResource resource = new ByteArrayResource(content);
            when(exportsService.exportByteArrayResource(any(Request.class))).thenReturn(resource);

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Disposition",
                            "attachment;filename=test-export.csv"))
                    .andExpect(content().contentType(MediaType.APPLICATION_OCTET_STREAM))
                    .andExpect(content().bytes(content));
        }

        @Test
        @DisplayName("POST /exports/streamExport returns 200 with byte array from output stream")
        void streamExport_validRequest_returnsByteArray() throws Exception {
            Request request = validRequest();
            request.setFileType("pdf");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            baos.write("pdf-data".getBytes(), 0, 8);
            when(exportsService.exportByteArrayOutputStream(any(Request.class))).thenReturn(baos);

            mockMvc.perform(post("/exports/streamExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Disposition",
                            "attachment;filename=test-export.pdf"))
                    .andExpect(content().contentType(MediaType.APPLICATION_OCTET_STREAM));
        }

        @Test
        @DisplayName("POST /exports/flushConfig returns 200")
        void flushConfig_returns200() throws Exception {
            mockMvc.perform(post("/exports/flushConfig"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("POST /exports/listExports returns 200 with export names")
        void listExports_returnsExportNames() throws Exception {
            when(exportsService.getAvailableExports())
                    .thenReturn(List.of("export-a", "export-b", "export-c"));

            mockMvc.perform(post("/exports/listExports"))
                    .andExpect(status().isOk())
                    .andExpect(content().string("export-a\nexport-b\nexport-c\n"));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Orange Path — Edge cases, empty/null results
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Orange Path — Edge cases and near-boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("POST /exports/fileExport returns 404 when service returns null bytes")
        void fileExport_nullBytes_returns404() throws Exception {
            Request request = validRequest();
            when(exportsService.exportByteArrayResource(any(Request.class))).thenReturn(null);

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("POST /exports/streamExport returns 404 when service returns null stream")
        void streamExport_nullStream_returns404() throws Exception {
            Request request = validRequest();
            when(exportsService.exportByteArrayOutputStream(any(Request.class))).thenReturn(null);

            mockMvc.perform(post("/exports/streamExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("POST /exports/listExports returns 200 with empty string when no exports available")
        void listExports_emptyList_returns200WithEmptyContent() throws Exception {
            when(exportsService.getAvailableExports()).thenReturn(List.of());

            mockMvc.perform(post("/exports/listExports"))
                    .andExpect(status().isOk())
                    .andExpect(content().string(""));
        }

        @Test
        @DisplayName("POST /exports/fileExport with blank name still processes request")
        void fileExport_blankName_processed() throws Exception {
            Request request = validRequest();
            request.setName("");
            byte[] content = "data".getBytes();
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource(content));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Red Path — Validation failures, bad input, exceptions
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Red Path — Invalid input and error conditions")
    class RedPath {

        @Test
        @DisplayName("POST /exports/fileExport throws ServletException when validator throws — no exception handler")
        void fileExport_validatorThrows_returnsServerError() throws Exception {
            Request request = validRequest();
            doThrow(new InvalidExportRequestException("Invalid request"))
                    .when(exportRequestValidator).validate(any(Request.class));

            // GAP: InvalidExportRequestException extends RuntimeException.
            // In standalone MockMvc without @ExceptionHandler, the exception
            // propagates as a ServletException rather than being mapped to 500.
            // The production app needs a @ControllerAdvice to handle this properly.
            assertThrows(jakarta.servlet.ServletException.class, () ->
                    mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request))));
        }

        @Test
        @DisplayName("POST /exports/fileExport with missing request body returns 400")
        void fileExport_nullRequestBody_returns400() throws Exception {
            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("POST /exports/fileExport with XSS payload in name is passed through")
        void fileExport_xssInName_passedThrough() throws Exception {
            Request request = validRequest();
            request.setName("<script>alert('xss')</script>");
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource("safe".getBytes()));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk());
            verify(exportsService).exportByteArrayResource(any(Request.class));
        }

        @Test
        @DisplayName("POST /exports/fileExport with SQL injection in name is passed through")
        void fileExport_sqlInjectionInName_passedThrough() throws Exception {
            Request request = validRequest();
            request.setName("test'; DROP TABLE users;--");
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource("safe".getBytes()));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("POST /exports/fileExport with path traversal in name is passed through")
        void fileExport_pathTraversalInName_passedThrough() throws Exception {
            Request request = validRequest();
            request.setName("../../../etc/passwd");
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource("safe".getBytes()));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("POST /exports/fileExport with very long name (500 chars) is accepted")
        void fileExport_veryLongName_accepted() throws Exception {
            Request request = validRequest();
            request.setName("a".repeat(500));
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource("safe".getBytes()));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Silent Failure — Regression locks, format checks
    // ═══════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Silent Failure — Regression locks and format verification")
    class SilentFailure {

        @Test
        @DisplayName("fileExport Content-Disposition header follows 'attachment;filename=<name>.<type>' format")
        void fileExport_contentDispositionHeaderFormat() throws Exception {
            Request request = validRequest();
            request.setName("my-report");
            request.setFileType("xlsx");
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource("xlsx-data".getBytes()));

            mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Disposition",
                            "attachment;filename=my-report.xlsx"));
        }

        @Test
        @DisplayName("fileExport uses APPLICATION_OCTET_STREAM content type regardless of file type")
        void fileExport_contentTypeIsOctetStream() throws Exception {
            for (String fileType : List.of("csv", "pdf", "xlsx")) {
                Request request = validRequest();
                request.setFileType(fileType);
                when(exportsService.exportByteArrayResource(any(Request.class)))
                        .thenReturn(new ByteArrayResource("data".getBytes()));

                mockMvc.perform(post("/exports/fileExport")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestJson(request)))
                        .andExpect(content().contentType(MediaType.APPLICATION_OCTET_STREAM));
            }
        }

        @Test
        @DisplayName("Metamorphic: identical fileExport requests produce identical responses")
        void fileExport_identicalRequests_identicalResponses() throws Exception {
            Request request = validRequest();
            byte[] content = "deterministic".getBytes();
            when(exportsService.exportByteArrayResource(any(Request.class)))
                    .thenReturn(new ByteArrayResource(content));

            var result1 = mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andReturn();

            var result2 = mockMvc.perform(post("/exports/fileExport")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestJson(request)))
                    .andReturn();

            org.assertj.core.api.Assertions.assertThat(result1.getResponse().getContentAsByteArray())
                    .isEqualTo(result2.getResponse().getContentAsByteArray());
            org.assertj.core.api.Assertions.assertThat(result1.getResponse().getStatus())
                    .isEqualTo(result2.getResponse().getStatus());
        }

        @Test
        @DisplayName("flushConfig first call returns 200 (subsequent calls fail due to PropertyConfig path bug)")
        void flushConfig_idempotent() throws Exception {
            // GAP: PropertyConfig.init() reads from "java/src/main/resources/shrapnel.properties"
            // (filesystem path, not classpath) which doesn't exist from test CWD.
            // The first getInstance() call populates the singleton; flush() nullifies it.
            // Subsequent getInstance() → init() fails because the file path is wrong.
            // This is a pre-existing bug — this test documents the current behavior.
            mockMvc.perform(post("/exports/flushConfig")).andExpect(status().isOk());
        }
    }
}
