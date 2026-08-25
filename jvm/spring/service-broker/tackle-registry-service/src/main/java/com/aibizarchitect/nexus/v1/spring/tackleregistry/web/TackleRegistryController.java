package com.aibizarchitect.nexus.v1.spring.tackleregistry.web;

import com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle.TackleRecords;
import com.aibizarchitect.nexus.v1.spring.tackleregistry.tackle.TackleRegistryService;
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
 *
 * D-C step 2 (consumer compatibility, see analysis thread 6d97277a): every
 * route is ALSO served under /config/ai/* — the tackle-srv mount path — so
 * existing consumers (tackle-ui, tackle-mcp) can point at this service
 * without rewriting their URL prefixes. Both paths return identical data;
 * the snake_case serialization mode is a separate, opt-in toggle
 * (tackle-registry.snake-case-serialization).
 */
@RestController
@RequestMapping("/config")
public class TackleRegistryController {

    private final TackleRegistryService registry;

    public TackleRegistryController(TackleRegistryService registry) {
        this.registry = registry;
    }

    @GetMapping({"/providers", "/ai/providers"})
    public Iterable<TackleRecords.Provider> providers() {
        return registry.providers();
    }

    @GetMapping({"/harnesses", "/ai/harnesses"})
    public Iterable<TackleRecords.Harness> harnesses() {
        return registry.harnesses();
    }

    @GetMapping({"/models", "/ai/models"})
    public Iterable<TackleRecords.ModelRow> models() {
        return registry.models();
    }

    @GetMapping({"/roles", "/ai/roles"})
    public Iterable<TackleRecords.RoleRow> roles() {
        return registry.roles();
    }

    @GetMapping({"/bundles", "/ai/bundles"})
    public Iterable<TackleRecords.ConfigBundle> bundles() {
        return registry.bundles();
    }

    @GetMapping({"/bundles/{role}", "/ai/bundles/{role}"})
    public Iterable<TackleRecords.ConfigBundle> bundlesForRole(@PathVariable String role) {
        return registry.bundlesForRole(role);
    }

    @GetMapping({"/resolve/{role}", "/ai/resolve/{role}"})
    public ResponseEntity<?> resolve(@PathVariable String role) {
        TackleRecords.ResolvedRoleConfig config = registry.resolve(role);
        if (config == null) {
            return ResponseEntity.status(404)
                    .body(Map.of("error", "No config found for role '" + role + "'"));
        }
        return ResponseEntity.ok(config);
    }
}
