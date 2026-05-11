package com.aibizarchitect.nexus.v1.spring.serviceregistry.dto;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.aibizarchitect.nexus.v1.dto.PagedResponse;


/**
 * Spring-specific PagedResponse utilities for creating paged responses from Spring Data Page objects.
 */
public class SpringPagedResponse {

    /**
     * Create a PagedResponse from a Spring Data Page
     */
    public static <T> PagedResponse<T> fromPage(Page<T> page) {
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

        PagedResponse.Meta meta = new PagedResponse.Meta(
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                nextPageUrl
        );

        return new PagedResponse<>(page.getContent(), meta);
    }

    /**
     * Create a raw Map response for legacy endpoints that need Map<String, Object> output.
     * // @Deprecated Use {@link #fromPage(Page)} instead.
     */
    // @Deprecated
    public static <T> Map<String, Object> fromPageAsMap(Page<T> page) {
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

        // Also include 'content' for legacy Angular HTTP client compatibility,
        // until all endpoints move to TypeSpec client.
        response.put("content", page.getContent());

        if (nextPageUrl != null) {
            response.put("nextPageUrl", nextPageUrl);
        }

        return response;
    }
}
