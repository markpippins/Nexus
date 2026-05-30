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

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", page.getContent());
        response.put("totalElements", page.getTotalElements());
        response.put("totalPages", page.getTotalPages());
        response.put("number", page.getNumber());
        response.put("numberOfElements", page.getNumberOfElements());
        response.put("size", page.getSize());
        response.put("content", page.getContent());

        if (nextPageUrl != null) {
            response.put("nextPageUrl", nextPageUrl);
        }

        return response;
    }
}
