package com.aibizarchitect.nexus.v1.spring.topology.controller;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.spring.topology.dto.ServiceLookupResponse;
import com.aibizarchitect.nexus.v1.spring.topology.service.LookupService;

/**
 * T25 1.3 (R-A-2026-08-15-008) — instance lookup, served by terrain (:8084).
 *
 * <pre>
 * GET /api/v1/lookup/&lt;unit&gt;            single unit lookup
 * GET /api/v1/lookup?units=a,b,c       batch variant (mirrors /heartbeat/batch)
 * </pre>
 */
@RestController
@RequestMapping("/api/v1/lookup")
public class LookupController {

    private final LookupService lookupService;

    public LookupController(LookupService lookupService) {
        this.lookupService = lookupService;
    }

    @GetMapping("/{unit}")
    public ResponseEntity<?> lookupUnit(@PathVariable String unit) {
        return lookupService.lookup(unit)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("unit", unit, "error", "unknown_unit")));
    }

    @GetMapping(params = "units")
    public Map<String, Object> lookupBatch(@RequestParam String units) {
        List<String> requested = Arrays.stream(units.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        List<ServiceLookupResponse> data = requested.stream()
                .map(lookupService::lookup)
                .flatMap(java.util.Optional::stream)
                .toList();
        return Map.of("data", data, "meta", Map.of("total", data.size()));
    }
}
