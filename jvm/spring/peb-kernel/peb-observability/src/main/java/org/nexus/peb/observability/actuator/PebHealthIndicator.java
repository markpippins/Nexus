package org.nexus.peb.observability.actuator;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;

/**
 * Custom health indicator for the PEB Kernel that verifies database connectivity
 * and provides component-level detail for the actuator health endpoint.
 */
@Component
public class PebHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    public PebHealthIndicator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Health health() {
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(3)) {
                return Health.up()
                        .withDetail("database", "reachable")
                        .withDetail("schema", "peb")
                        .withDetail("catalog", conn.getCatalog())
                        .build();
            } else {
                return Health.down()
                        .withDetail("database", "unreachable")
                        .build();
            }
        } catch (Exception e) {
            return Health.down()
                    .withDetail("database", "unreachable")
                    .withDetail("error", e.getMessage())
                    .build();
        }
    }
}
