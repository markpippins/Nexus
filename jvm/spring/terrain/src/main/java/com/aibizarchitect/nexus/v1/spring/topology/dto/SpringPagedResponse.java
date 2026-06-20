package com.aibizarchitect.nexus.v1.spring.topology.dto;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Spring-specific PagedResponse utilities for creating paged responses from Spring Data Page objects.
 */
public class SpringPagedResponse {

    /**
     * Create a PagedResponse from a Spring Data Page
     */
    public static <T> Map<String, Object> fromPage(Page<T> page) {
        String nextPageUrl = null;
        if (page.hasNext() && RequestContextHolder.getRequestAttributes() != null) {
            try {
                nextPageUrl = ServletUriComponentsBuilder.fromCurrentRequest()
                        .replaceQueryParam("page", page.getNumber() + 1)
                        .build()
                        .toUriString();
            } catch (Exception e) {
                // Ignore URI building errors if outside of a web request context
            }
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("page", page.getNumber());
        meta.put("per_page", page.getSize());
        meta.put("total", page.getTotalElements());
        meta.put("last_page", page.getTotalPages());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", page.getContent());
        response.put("meta", meta);

        if (nextPageUrl != null) {
            meta.put("next_page_url", nextPageUrl);
        }

        return response;
    }
}
