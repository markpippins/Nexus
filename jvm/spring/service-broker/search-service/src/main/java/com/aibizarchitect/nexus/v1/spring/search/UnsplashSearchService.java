package com.aibizarchitect.nexus.v1.spring.search;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;

@Service("unsplashSearchService")
public class UnsplashSearchService {

    private static final Logger log = LoggerFactory.getLogger(UnsplashSearchService.class);

    private final RestTemplate restTemplate;

    private final SearchResultsCacheRepository cacheRepository;

    // Unsplash API key - in a real implementation, this should be configured via
    // properties
    private String unsplashApiKey = "YOUR_UNSPLASH_ACCESS_KEY_HERE";

    private static final long CACHE_TTL_MINUTES = 30; // Cache TTL in minutes

    public UnsplashSearchService(RestTemplate restTemplate, SearchResultsCacheRepository cacheRepository) {
        this.restTemplate = restTemplate;
        this.cacheRepository = cacheRepository;
        log.info("UnsplashSearchService initialized with MongoDB cache");
    }

    @BrokerOperation("searchImages")
    public SearchResult searchImages(@BrokerParam("token") String token, @BrokerParam("query") String query) {
        log.info("Unsplash image search query received: {}", query);

        // First, check if we have a cached result for this query in MongoDB
        SearchResultsCacheEntry cachedEntry = findValidCacheEntry(query);
        if (cachedEntry != null) {
            log.info("Returning cached result from MongoDB for Unsplash query: {}", query);
            SearchResult result = new SearchResult();
            result.setItems(cachedEntry.getItems());
            result.setRawResponse(cachedEntry.getItems().get(0).getPagemap()); // Simplified for demo
            return result;
        }

        // Validate configuration
        if (unsplashApiKey == null || unsplashApiKey.isEmpty()
                || unsplashApiKey.equals("YOUR_UNSPLASH_ACCESS_KEY_HERE")) {
            throw new IllegalStateException("Unsplash API Key is required. Please set it in application.properties.");
        }

        // Properly URL encode the query
        String encodedQuery = java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format("https://api.unsplash.com/search/photos?query=%s&per_page=10", encodedQuery);

        try {
            log.debug("Making Unsplash search request to: {}", url);

            // Create headers for Unsplash API
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Client-ID " + unsplashApiKey);
            HttpEntity<String> entity = new HttpEntity<>("", headers);

            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                Map<String, Object> data = response.getBody();

                // Extract results from the response
                List<Map<String, Object>> rawResults = (List<Map<String, Object>>) data.get("results");
                List<SearchResultItem> items = new ArrayList<>();

                if (rawResults != null) {
                    for (Map<String, Object> rawResult : rawResults) {
                        SearchResultItem item = new SearchResultItem();
                        item.setKind((String) rawResult.get("id")); // Unsplash photo ID as kind

                        // Extract basic information
                        item.setTitle((String) rawResult.get("alt_description"));
                        item.setDescription((String) rawResult.get("description"));

                        // Extract URLs
                        Map<String, Object> urls = (Map<String, Object>) rawResult.get("urls");
                        if (urls != null) {
                            item.setRegularImageUrl((String) urls.get("regular"));
                            item.setSmallImageUrl((String) urls.get("small"));
                            item.setThumbImageUrl((String) urls.get("thumb"));
                            item.setFullImageUrl((String) urls.get("full"));
                        }

                        // Extract photographer information
                        Map<String, Object> user = (Map<String, Object>) rawResult.get("user");
                        if (user != null) {
                            item.setPhotographerName((String) user.get("name"));
                            item.setPhotographerUsername((String) user.get("username"));
                            Map<String, Object> userLinks = (Map<String, Object>) user.get("links");
                            if (userLinks != null) {
                                item.setPhotographerPortfolioUrl((String) userLinks.get("html"));
                            }
                        }

                        // Extract image statistics
                        Map<String, Object> stats = (Map<String, Object>) rawResult.get("statistics");
                        if (stats != null) {
                            Map<String, Object> downloads = (Map<String, Object>) stats.get("downloads");
                            Map<String, Object> views = (Map<String, Object>) stats.get("views");
                            if (downloads != null) {
                                item.setDownloadCount((Integer) downloads.get("total"));
                            }
                            if (views != null) {
                                item.setViewCount((Integer) views.get("total"));
                            }
                        }

                        // Extract dimensions
                        Integer width = (Integer) rawResult.get("width");
                        Integer height = (Integer) rawResult.get("height");
                        item.setWidth(width);
                        item.setHeight(height);

                        // Extract timestamps
                        String createdAt = (String) rawResult.get("created_at");
                        String updatedAt = (String) rawResult.get("updated_at");
                        item.setCreatedAt(createdAt);
                        item.setUpdatedAt(updatedAt);

                        // Extract categories/tags
                        List<Map<String, Object>> tags = (List<Map<String, Object>>) rawResult.get("tags");
                        if (tags != null) {
                            List<String> tagNames = new ArrayList<>();
                            for (Map<String, Object> tag : tags) {
                                String tagName = (String) tag.get("title");
                                if (tagName != null) {
                                    tagNames.add(tagName);
                                }
                            }
                            item.setTags(tagNames);
                        }

                        // Set the timestamp to current time
                        item.setTimestamp(Instant.now());

                        items.add(item);
                    }
                }

                SearchResult result = new SearchResult();
                result.setItems(items);
                result.setRawResponse(data);

                // Cache the result in MongoDB before returning
                SearchResultsCacheEntry newCacheEntry = new SearchResultsCacheEntry(query, items, CACHE_TTL_MINUTES);
                cacheRepository.save(newCacheEntry);
                log.info("Cached Unsplash search result in MongoDB for query: {}", query);

                return result;
            } else {
                log.error("Unsplash search API returned error: {}", response.getStatusCode());
                throw new RuntimeException("Unsplash search API returned error: " + response.getStatusCode());
            }
        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error("Network error performing Unsplash search: {}", e.getMessage());
            throw new RuntimeException("Network connection failed: " + e.getMessage());
        } catch (Exception e) {
            log.error("Error performing Unsplash search: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch Unsplash search results: " + e.getMessage());
        }
    }

    /**
     * Find a valid cache entry (not expired) for the given query
     */
    private SearchResultsCacheEntry findValidCacheEntry(String query) {
        try {
            var optionalEntry = cacheRepository.findByQuery(query);
            if (optionalEntry.isPresent()) {
                SearchResultsCacheEntry entry = optionalEntry.get();
                if (!entry.isExpired()) {
                    return entry;
                } else {
                    // Entry is expired, remove it
                    cacheRepository.deleteById(entry.getId());
                    log.info("Removed expired Unsplash cache entry for query: {}", query);
                }
            }
            return null;
        } catch (Exception e) {
            log.warn("Error accessing Unsplash cache for query {}: {}", query, e.getMessage());
            return null; // Return null to proceed with fresh search
        }
    }
}