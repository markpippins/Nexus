package com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Datasource for the tackle registry schema.
 *
 * <p>Accepts the repo-standard URI-form DSN (postgres://user:pass@host:5432/db)
 * via TACKLE_REGISTRY_PG_DSN (legacy alias LOSM_PG_DSN) and pins the connection's currentSchema to the tackle
 * schema, so every query in TackleRegistryService can use unqualified table
 * names. Falls back to spring.datasource.url/username/password when unset.
 */
@Configuration
public class TackleRegistryDataSourceConfig {

    private static final Pattern URI_DSN =
            Pattern.compile("^(?:postgres(?:ql)?://)([^:/@]+):([^@/]*)@([^:/]+):(\\d+)/(.+)$");

    @Bean
    public DataSource dataSource() {
        String dsn = System.getenv("TACKLE_REGISTRY_PG_DSN");
        if (dsn == null || dsn.isBlank()) dsn = System.getenv("LOSM_PG_DSN"); // legacy alias, pre-rename deploys
        HikariConfig cfg = new HikariConfig();
        cfg.setMaximumPoolSize(8);
        cfg.setMinimumIdle(1);
        // Defer connectivity failures to first use: the context must start
        // (and skeleton tests must load) even when no DB is reachable yet.
        cfg.setInitializationFailTimeout(-1);

        if (dsn != null && !dsn.isBlank()) {
            Matcher m = URI_DSN.matcher(dsn.trim());
            if (!m.matches()) {
                throw new IllegalStateException(
                        "LOSM_PG_DSN must be a postgres:// URI (got: "
                                + dsn.replaceAll(":[^:@/]+@", ":***@") + ")");
            }
            String user = m.group(1), pass = m.group(2), host = m.group(3),
                    port = m.group(4), db = m.group(5);
            cfg.setJdbcUrl("jdbc:postgresql://%s:%s/%s?currentSchema=%s".formatted(
                    host, port, db, envOr("LOSM_TACKLE_SCHEMA", "tackle")));
            cfg.setUsername(user);
            cfg.setPassword(pass);
        } else {
            // Standard Boot path: spring.datasource.* properties
            cfg.setJdbcUrl(envOr("spring.datasource.url",
                    "jdbc:postgresql://localhost:5432/nexus?currentSchema=tackle"));
            cfg.setUsername(envOr("spring.datasource.username", "pguser"));
            cfg.setPassword(envOr("spring.datasource.password", "pgpass"));
        }
        return new HikariDataSource(cfg);
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource ds) {
        return new JdbcTemplate(ds);
    }

    private static String envOr(String key, String fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }
}
