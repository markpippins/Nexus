package nexus.serviceregistry.v1.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Database schema validator and fixer to address column type mismatches
 * that occur when the database schema doesn't match entity definitions.
 */
@Component
public class DatabaseSchemaValidator {

    private static final Logger log = LoggerFactory.getLogger(DatabaseSchemaValidator.class);

    private final DataSource dataSource;
    private final Environment env;

    public DatabaseSchemaValidator(DataSource dataSource, Environment env) {
        this.dataSource = dataSource;
        this.env = env;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void validateAndFixSchema() {
        log.info("Validating and fixing database schema if needed...");

        try (Connection conn = dataSource.getConnection()) {
            // Check for common column type mismatches
            List<String> tablesToCheck = Arrays.asList(
                    "categories", "environment_types", "frameworks",
                    "languages", "server_types", "services", "service_types");

            for (String tableName : tablesToCheck) {
                validateAndFixIdColumn(conn, tableName);
            }

            // Check foreign key columns
            validateAndFixForeignKeyColumns(conn);

            log.info("Database schema validation and fix completed.");
        } catch (SQLException e) {
            log.error("Error validating and fixing database schema: {}", e.getMessage(), e);
        }
    }

    private void validateAndFixIdColumn(Connection conn, String tableName) throws SQLException {
        String sql = "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id'";

        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, tableName);
            ResultSet rs = stmt.executeQuery();

            if (rs.next()) {
                String dataType = rs.getString("DATA_TYPE");

                if (!dataType.equalsIgnoreCase("bigint")) {
                    log.warn("Fixing column type for {}.id: {} -> bigint", tableName, dataType);

                    String alterSql = "ALTER TABLE " + tableName + " MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT";
                    try (PreparedStatement alterStmt = conn.prepareStatement(alterSql)) {
                        alterStmt.executeUpdate();
                        log.info("Successfully fixed {}.id column type to BIGINT", tableName);
                    }
                }
            }
        }
    }

    private void validateAndFixForeignKeyColumns(Connection conn) throws SQLException {
        // Define the mappings of tables and their foreign key columns that should be
        // BIGINT
        String[][] fkMappings = {
                { "frameworks", "category_id" },
                { "frameworks", "language_id" },
                { "frameworks", "vendor_id" },
                { "services", "framework_id" },
                { "services", "service_type_id" },
                { "deployments", "service_id" },
                { "deployments", "environment_id" },
                { "deployments", "server_id" },
                { "servers", "environment_type_id" },
                { "servers", "server_type_id" },
                { "servers", "operating_system_id" },
                { "service_configs", "service_id" },
                { "service_configs", "config_type_id" },
                { "service_configs", "environment_id" },
                { "service_dependencies", "service_id" },
                { "service_dependencies", "target_service_id" },
                { "service_libraries", "service_id" },
                { "service_libraries", "library_id" },
                { "libraries", "language_id" },
                { "libraries", "category_id" }
        };

        for (String[] mapping : fkMappings) {
            String tableName = mapping[0];
            String columnName = mapping[1];

            validateAndFixForeignKeyColumn(conn, tableName, columnName);
        }
    }

    private void validateAndFixForeignKeyColumn(Connection conn, String tableName, String columnName)
            throws SQLException {
        String sql = "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?";

        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, tableName);
            stmt.setString(2, columnName);
            ResultSet rs = stmt.executeQuery();

            if (rs.next()) {
                String dataType = rs.getString("DATA_TYPE");

                if (!dataType.equalsIgnoreCase("bigint")) {
                    log.warn("Fixing column type for {}.{}: {} -> bigint", tableName, columnName, dataType);

                    String alterSql = "ALTER TABLE " + tableName + " MODIFY COLUMN " + columnName + " BIGINT";
                    try (PreparedStatement alterStmt = conn.prepareStatement(alterSql)) {
                        alterStmt.executeUpdate();
                        log.info("Successfully fixed {}.{} column type to BIGINT", tableName, columnName);
                    }
                }
            }
        }
    }
}
