package com.angrysurfer.spring.nexus.search;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.angrysurfer.spring.nexus.broker.spi.BrokerOperation;
import com.angrysurfer.spring.nexus.broker.spi.BrokerParam;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.time.Instant;

@Service("geminiSearchService")
public class GeminiSearchService {

    private static final Logger log = LoggerFactory.getLogger(GeminiSearchService.class);

    private final RestTemplate restTemplate;
    
    private final SearchResultsCacheRepository cacheRepository;

    // Gemini API key - in a real implementation, this should be configured via properties
    private String geminiApiKey = "YOUR_GEMINI_API_KEY_HERE";

    private static final long CACHE_TTL_MINUTES = 30; // Cache TTL in minutes

    @Autowired
    public GeminiSearchService(RestTemplate restTemplate, SearchResultsCacheRepository cacheRepository) {
        this.restTemplate = restTemplate;
        this.cacheRepository = cacheRepository;
        log.info("GeminiSearchService initialized with MongoDB cache");
    }

    @BrokerOperation("generateContent")
    public SearchResult generateContent(@BrokerParam("token") String token, @BrokerParam("prompt") String prompt) {
        log.info("Gemini content generation request received: {}", prompt);

        // First, check if we have a cached result for this prompt in MongoDB
        String query = "gemini_prompt:" + prompt; // Use a prefixed query to distinguish Gemini prompts
        SearchResultsCacheEntry cachedEntry = findValidCacheEntry(query);
        if (cachedEntry != null) {
            log.info("Returning cached result from MongoDB for Gemini prompt: {}", prompt);
            SearchResult result = new SearchResult();
            result.setItems(cachedEntry.getItems());
            result.setRawResponse(cachedEntry.getItems().get(0).getPagemap()); // Simplified for demo
            return result;
        }

        // Validate configuration
        if (geminiApiKey == null || geminiApiKey.isEmpty() || geminiApiKey.equals("YOUR_GEMINI_API_KEY_HERE")) {
            throw new IllegalStateException("Gemini API Key is required. Please set it in application.properties.");
        }

        // Properly URL encode the prompt
        String encodedPrompt = java.net.URLEncoder.encode(prompt, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=%s", geminiApiKey);

        // Create the request body for the Gemini API
        Map<String, Object> requestBody = createGeminiRequest(prompt);

        try {
            log.debug("Making Gemini API request to: {}", url);
            
            // Create headers for Gemini API
            HttpHeaders headers = new HttpHeaders();
            headers.set("Content-Type", "application/json");
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
            
            if (response.getStatusCode().is2xxSuccessful()) {
                Map<String, Object> data = response.getBody();
                
                // Extract candidates from the response
                List<Map<String, Object>> candidates = (List<Map<String, Object>>) data.get("candidates");
                List<SearchResultItem> items = new ArrayList<>();
                
                if (candidates != null) {
                    for (Map<String, Object> candidate : candidates) {
                        Map<String, Object> content = (Map<String, Object>) candidate.get("content");
                        if (content != null) {
                            List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
                            if (parts != null) {
                                for (Map<String, Object> part : parts) {
                                    SearchResultItem item = new SearchResultItem();
                                    item.setKind("gemini-response");
                                    item.setPrompt(prompt);
                                    
                                    // Extract text content
                                    String text = (String) part.get("text");
                                    if (text != null) {
                                        item.setTitle("Gemini Response");
                                        item.setHtmlTitle("Gemini Response");
                                        item.setSnippet(text.substring(0, Math.min(text.length(), 200)) + "..."); // Truncate for snippet
                                        item.setHtmlSnippet(text.substring(0, Math.min(text.length(), 200)) + "...");
                                        item.setGeneratedText(text);
                                        
                                        // Set the timestamp to current time
                                        item.setTimestamp(Instant.now());
                                        
                                        items.add(item);
                                    }
                                }
                            }
                        }
                    }
                }

                // Also handle safety ratings and other response metadata
                List<Map<String, Object>> promptFeedback = (List<Map<String, Object>>) data.get("promptFeedback");
                if (promptFeedback != null) {
                    SearchResultItem feedbackItem = new SearchResultItem();
                    feedbackItem.setKind("gemini-feedback");
                    feedbackItem.setPromptFeedback(promptFeedback);
                    
                    // Set the timestamp to current time
                    feedbackItem.setTimestamp(Instant.now());
                    
                    items.add(feedbackItem);
                }

                SearchResult result = new SearchResult();
                result.setItems(items);
                result.setRawResponse(data);
                
                // Cache the result in MongoDB before returning
                SearchResultsCacheEntry newCacheEntry = new SearchResultsCacheEntry(query, items, CACHE_TTL_MINUTES);
                cacheRepository.save(newCacheEntry);
                log.info("Cached Gemini response in MongoDB for prompt: {}", prompt);
                
                return result;
            } else {
                log.error("Gemini API returned error: {}", response.getStatusCode());
                throw new RuntimeException("Gemini API returned error: " + response.getStatusCode());
            }
        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error("Network error performing Gemini request: {}", e.getMessage());
            throw new RuntimeException("Network connection failed: " + e.getMessage());
        } catch (Exception e) {
            log.error("Error performing Gemini request: {}", e.getMessage());
            throw new RuntimeException("Failed to generate content with Gemini: " + e.getMessage());
        }
    }
    
    /**
     * Creates the request body for the Gemini API
     */
    private Map<String, Object> createGeminiRequest(String prompt) {
        Map<String, Object> request = new java.util.HashMap<>();
        
        Map<String, Object> contents = new java.util.HashMap<>();
        contents.put("role", "user");
        
        List<Map<String, Object>> parts = new ArrayList<>();
        Map<String, Object> part = new java.util.HashMap<>();
        part.put("text", prompt);
        parts.add(part);
        
        contents.put("parts", parts);
        
        List<Map<String, Object>> contentsList = new ArrayList<>();
        contentsList.add(contents);
        
        request.put("contents", contentsList);
        
        // Add generation configuration (optional)
        Map<String, Object> generationConfig = new java.util.HashMap<>();
        generationConfig.put("temperature", 0.9);
        generationConfig.put("topK", 1);
        generationConfig.put("topP", 1);
        generationConfig.put("maxOutputTokens", 2048);
        generationConfig.put("stopSequences", new String[]{});
        request.put("generationConfig", generationConfig);
        
        return request;
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
                    log.info("Removed expired Gemini cache entry for query: {}", query);
                }
            }
            return null;
        } catch (Exception e) {
            log.warn("Error accessing Gemini cache for query {}: {}", query, e.getMessage());
            return null; // Return null to proceed with fresh request
        }
    }
}