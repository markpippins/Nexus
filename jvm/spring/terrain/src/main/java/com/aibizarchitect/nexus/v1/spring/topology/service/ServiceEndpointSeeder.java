package com.aibizarchitect.nexus.v1.spring.topology.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.aibizarchitect.nexus.v1.spring.topology.entity.RunnableService;
import com.aibizarchitect.nexus.v1.spring.topology.entity.Server;
import com.aibizarchitect.nexus.v1.spring.topology.repository.RunnableServiceRepository;
import com.aibizarchitect.nexus.v1.spring.topology.repository.ServerRepository;

/**
 * T25 1.3 — idempotent seed of terrain.service_endpoints from
 * runnable_services + host servers (host -> ip). Runs at startup; never
 * wipes existing rows, never touches last_heartbeat. Runtime facts only —
 * catalog metadata is registry's job (1.2 sync).
 */
@Component
public class ServiceEndpointSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ServiceEndpointSeeder.class);

    private final RunnableServiceRepository runnableServiceRepository;
    private final ServerRepository serverRepository;
    private final JdbcTemplate jdbcTemplate;

    public ServiceEndpointSeeder(RunnableServiceRepository runnableServiceRepository,
            ServerRepository serverRepository, JdbcTemplate jdbcTemplate) {
        this.runnableServiceRepository = runnableServiceRepository;
        this.serverRepository = serverRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        try {
            List<RunnableService> services = runnableServiceRepository.findAll();
            List<Server> servers = serverRepository.findAll();

            Map<String, String> hostToIp = new HashMap<>();
            for (Server s : servers) {
                if (s.getHostname() != null && s.getIpAddress() != null) {
                    hostToIp.put(s.getHostname().toLowerCase(), s.getIpAddress());
                }
            }

            int seeded = 0;
            for (RunnableService rs : services) {
                if (rs.getName() == null || rs.getPort() == null) {
                    continue; // no port -> no reachable endpoint
                }
                String ip = hostToIp.getOrDefault("localhost", "127.0.0.1");
                // Prefer a server whose hostname matches the service name's host, else localhost.
                if (rs.getHealthCheckUrl() != null) {
                    String h = rs.getHealthCheckUrl().toLowerCase();
                    for (Map.Entry<String, String> e : hostToIp.entrySet()) {
                        if (h.contains(e.getKey())) {
                            ip = e.getValue();
                            break;
                        }
                    }
                }
                String status = "ONLINE".equalsIgnoreCase(rs.getStatus()) ? "UP" : "UNKNOWN";
                int n = jdbcTemplate.update(
                        "INSERT INTO terrain.service_endpoints (id, unit, instance, host, ip, port, scheme, status, last_heartbeat) "
                                + "VALUES (gen_random_uuid(), ?, 'primary', ?, ?::inet, ?, 'http', ?, NULL) "
                                + "ON CONFLICT (unit, instance) DO UPDATE SET "
                                + "host = EXCLUDED.host, ip = EXCLUDED.ip, port = EXCLUDED.port, "
                                + "scheme = EXCLUDED.scheme, status = EXCLUDED.status",
                        rs.getName(), "localhost", ip, rs.getPort(), status);
                seeded += n;
            }
            log.info("service_endpoints seeded/upserted for {} runnable service(s)", seeded);
        } catch (Exception e) {
            // Never block startup on seeding; lookup degrades to empty until next restart.
            log.warn("service_endpoints seed skipped: {}", e.getMessage());
        }
    }
}
