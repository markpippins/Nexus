package com.angrysurfer.spring.nexus.dto;

import org.springframework.data.domain.Page;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.angrysurfer.nexus.dto.PagedResponse;

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
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                nextPageUrl
        );

        return new PagedResponse<>(page.getContent(), meta);
    }
}
