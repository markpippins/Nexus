package org.nexus.peb.core.engine;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.nexus.peb.core.validation.InvariantValidator;
import org.nexus.peb.domain.entity.PebTransaction;
import org.nexus.peb.domain.enums.AdmissionPath;
import org.nexus.peb.domain.enums.AdmissionResult;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Cross-language contract test backed by the fixture also consumed by Python.
 *
 * <p>The fixture lives with the TypeSpec contract so the JVM and Python tests
 * exercise one admission truth table rather than maintaining two drifting
 * copies of expected path, validator, result, and response behavior.
 */
class SharedAdmissionFixtureTest {

    private static final Path FIXTURE = Path.of(
        "typespec", "v1", "peb-kernel", "conformance", "admission_cases.json"
    );

    static Stream<Arguments> admissionCases() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        return mapper.readValue(resolveFixture().toFile(), new TypeReference<List<AdmissionCase>>() {})
            .stream()
            .map(Arguments::of);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("admissionCases")
    void sharedFixtureMatchesJvmAdmissionSemantics(AdmissionCase fixture) {
        AdmissionPath path = AdmissionPath.fromToolName(fixture.toolName());
        PebTransaction transaction = new PebTransaction();
        ReflectionTestUtils.setField(transaction, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(transaction, "toolName", fixture.toolName());
        ReflectionTestUtils.setField(transaction, "entityId", fixture.entityId());
        ReflectionTestUtils.setField(transaction, "input", fixture.input());

        boolean validatorPasses = new InvariantValidator().validate(transaction);
        AdmissionResult engineResult =
            path == AdmissionPath.REPORT_VIOLATION || !validatorPasses
                ? AdmissionResult.REJECTED
                : path.defaultAdmissionResult();
        boolean admitted = path == AdmissionPath.REPORT_VIOLATION || validatorPasses;
        String message = path == AdmissionPath.REPORT_VIOLATION
            ? "Violation recorded as REJECTED"
            : admitted
                ? switch (path) {
                    case VALIDATE -> "Validation processed";
                    case MUTATE -> "Mutation processed";
                    default -> "Transaction processed";
                }
                : "Admission denied by invariant validator";

        assertEquals(fixture.expectedPath(), path.name());
        assertEquals(fixture.defaultAdmissionResult(), path.defaultAdmissionResult().name());
        if (fixture.validatorPasses()) {
            assertTrue(validatorPasses);
        } else {
            assertFalse(validatorPasses);
        }
        assertEquals(fixture.engineAdmissionResult(), engineResult.name());
        assertEquals(fixture.admitted(), admitted);
        assertEquals(fixture.message(), message);
    }

    private static Path resolveFixture() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (current != null) {
            Path candidate = current.resolve(FIXTURE);
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Shared PEB admission fixture not found: " + FIXTURE);
    }

    record AdmissionCase(
        String name,
        String toolName,
        String entityId,
        JsonNode input,
        String expectedPath,
        String defaultAdmissionResult,
        boolean validatorPasses,
        String engineAdmissionResult,
        boolean admitted,
        String message
    ) {
        @Override
        public String toString() {
            return name;
        }
    }
}
