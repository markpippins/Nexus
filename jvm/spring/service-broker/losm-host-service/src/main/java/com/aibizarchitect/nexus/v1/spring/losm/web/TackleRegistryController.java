package com.aibizarchitect.nexus.v1.spring.losm.web;

import com.aibizarchitect.nexus.v1.spring.losm.tackle.TackleRecords;
import com.aibizarchitect.nexus.v1.spring.losm.tackle.TackleRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Read-side mirror of tackle-srv's /config/ai registry surface, served from
 * the SAME tables. Path-for-path compatible with tackle-srv's ai-config
 * router (mounted at /config/ai there; here at /config for brevity):
 *
 *   GET /config/providers            GET /config/models
 *   GET /config/harnesses            GET /config/roles
 *   GET /config/bundles              GET /config/bundles/{role}
 *   GET /config/resolve/{role}       (priority-ordered active bundle)
 */
@RestController
@RequestMapping("/config")
public class TackleRegistryController {

    private final TackleRegistryService registry;

    public TackleRegistryController(TackleRegistryService registry) {
        this.registry = registry;
    }

    @GetMapping("/providers")
    public Iterable<TackleRecords.Provider> providers() {
        return registry.providers();
    }

    @GetMapping("/harnesses")
    public Iterable<TackleRecords.Harness> harnesses() {
        return registry.harnesses();
    }

    @GetMapping("/models")
    public Iterable<TackleRecords.ModelRow> models() {
        return registry.models();
    }

    @GetMapping("/roles")
    public Iterable<TackleRecords.RoleRow> roles() {
        return registry.roles();
    }

    @GetMapping("/bundles")
    public Iterable<TackleRecords.ConfigBundle> bundles() {
        return registry.bundles();
    }

    @GetMapping("/bundles/{role}")
    public Iterable<TackleRecords.ConfigBundle> bundlesForRole(@PathVariable String role) {
        return registry.bundlesForRole(role);
    }

    @GetMapping("/resolve/{role}")
    public ResponseEntity<?> resolve(@PathVariable String role) {
        TackleRecords.ResolvedRoleConfig config = registry.resolve(role);
        if (config == null) {
            return ResponseEntity.status(404)
                    .body(Map.of("error", "No config found for role '" + role + "'"));
        }
        return ResponseEntity.ok(config);
    }
}
