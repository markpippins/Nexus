package nexus.serviceregistry.v1.dto;

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

        java.util.Map<String, Object> response = new java.util.LinkedHashMap<>();
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

        // Return raw map which serializes correctly to both 'data' and 'content'
        return (PagedResponse<T>) (Object) response;
    }
}
