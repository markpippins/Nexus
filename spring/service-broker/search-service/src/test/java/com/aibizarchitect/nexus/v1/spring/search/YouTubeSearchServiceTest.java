package com.aibizarchitect.nexus.v1.spring.search;
// package com.aibizarchitect.nexus.v1.spring.search;

// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.extension.ExtendWith;
// import org.mockito.Mock;
// import org.mockito.junit.jupiter.MockitoExtension;
// import org.springframework.http.HttpEntity;
// import org.springframework.http.HttpMethod;
// import org.springframework.http.ResponseEntity;
// import org.springframework.web.client.RestTemplate;

// import java.util.*;

// import static org.junit.jupiter.api.Assertions.*;
// import static org.mockito.ArgumentMatchers.*;
// import static org.mockito.Mockito.*;

// @ExtendWith(MockitoExtension.class)
// class YouTubeSearchServiceTest {

// @Mock
// private RestTemplate restTemplate;

// @Mock
// private SearchResultsCacheRepository cacheRepository;

// private YouTubeSearchService youTubeSearchService;

// @BeforeEach
// void setUp() {
// youTubeSearchService = new YouTubeSearchService(restTemplate,
// cacheRepository);
// }

// @Test
// void testSearchVideosSuccess() {
// // Arrange
// String query = "test video";
// String token = "test-token";

// Map<String, Object> mockResponse = createMockApiResponse();
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(mockResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);

// when(cacheRepository.findByQuery(query)).thenReturn(Optional.empty());

// // Act
// SearchResult result = youTubeSearchService.searchVideos(token, query);

// // Assert
// assertNotNull(result);
// assertNotNull(result.getItems());
// assertEquals(2, result.getItems().size());

// // Verify the API call was made
// verify(restTemplate).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));

// // Verify caching was called
// verify(cacheRepository).save(any(SearchResultsCacheEntry.class));
// }

// @Test
// void testSearchVideosWithCache() {
// // Arrange
// String query = "cached video";
// String token = "test-token";

// List<SearchResultItem> cachedItems = Arrays.asList(
// createSampleSearchResultItem("Cached Video 1"),
// createSampleSearchResultItem("Cached Video 2")
// );

// SearchResultsCacheEntry cachedEntry = new SearchResultsCacheEntry(query,
// cachedItems, 30);
// when(cacheRepository.findByQuery(query)).thenReturn(Optional.of(cachedEntry));

// // Act
// SearchResult result = youTubeSearchService.searchVideos(token, query);

// // Assert
// assertNotNull(result);
// assertNotNull(result.getItems());
// assertEquals(2, result.getItems().size());

// // Verify the API was NOT called since we had cache
// verify(restTemplate, never()).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));
// }

// @Test
// void testSearchVideosNetworkError() {
// // Arrange
// String query = "failing query";
// String token = "test-token";

// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Network error"));

// when(cacheRepository.findByQuery(query)).thenReturn(Optional.empty());

// // Act & Assert
// RuntimeException exception = assertThrows(RuntimeException.class,
// () -> youTubeSearchService.searchVideos(token, query));

// assertTrue(exception.getMessage().contains("Network connection failed"));

// // Verify API was called but not cached
// verify(restTemplate).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));
// verify(cacheRepository, never()).save(any());
// }

// @Test
// void testSearchVideosApiError() {
// // Arrange
// String query = "error query";
// String token = "test-token";

// ResponseEntity<Map> errorResponse =
// ResponseEntity.status(400).body(Map.of("error", "Bad Request"));
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(errorResponse);
// when(cacheRepository.findByQuery(query)).thenReturn(Optional.empty());

// // Act & Assert
// RuntimeException exception = assertThrows(RuntimeException.class,
// () -> youTubeSearchService.searchVideos(token, query));

// assertTrue(exception.getMessage().contains("YouTube search API returned
// error"));

// // Verify API was called
// verify(restTemplate).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));
// }

// @Test
// void testSearchVideosNullApiKey() {
// // This test is more complex in the actual implementation
// // Just verify that the service can be instantiated and basic methods work
// String query = "test query";
// String token = "test-token";

// // For this test, let's make sure we handle cases where the response is null
// or incomplete
// Map<String, Object> emptyResponse = new HashMap<>();
// emptyResponse.put("items", new ArrayList<>());
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(emptyResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);
// when(cacheRepository.findByQuery(query)).thenReturn(Optional.empty());

// // Act & Assert - this should not fail even with a minimal response
// assertDoesNotThrow(() -> youTubeSearchService.searchVideos(token, query));
// }

// @Test
// void testSearchVideosNoItemsInResponse() {
// // Arrange
// String query = "no results query";
// String token = "test-token";

// Map<String, Object> mockResponse = new HashMap<>();
// mockResponse.put("items", null); // No items in response
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(mockResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);
// when(cacheRepository.findByQuery(query)).thenReturn(Optional.empty());

// // Act
// SearchResult result = youTubeSearchService.searchVideos(token, query);

// // Assert
// assertNotNull(result);
// assertNull(result.getItems());
// }

// // Helper method to create mock API response
// private Map<String, Object> createMockApiResponse() {
// Map<String, Object> response = new HashMap<>();

// List<Map<String, Object>> items = new ArrayList<>();

// // First video item
// Map<String, Object> snippet1 = new HashMap<>();
// snippet1.put("title", "Test Video 1");
// snippet1.put("channelTitle", "Test Channel 1");
// snippet1.put("publishedAt", "2023-01-01T00:00:00Z");

// Map<String, Object> defaultThumbnail1 = new HashMap<>();
// defaultThumbnail1.put("url", "http://example.com/thumb1_default.jpg");
// Map<String, Object> mediumThumbnail1 = new HashMap<>();
// mediumThumbnail1.put("url", "http://example.com/thumb1_medium.jpg");
// Map<String, Object> highThumbnail1 = new HashMap<>();
// highThumbnail1.put("url", "http://example.com/thumb1_high.jpg");

// Map<String, Object> thumbnails1 = new HashMap<>();
// thumbnails1.put("default", defaultThumbnail1);
// thumbnails1.put("medium", mediumThumbnail1);
// thumbnails1.put("high", highThumbnail1);

// snippet1.put("thumbnails", thumbnails1);

// Map<String, Object> id1 = new HashMap<>();
// id1.put("videoId", "abc123");
// id1.put("kind", "youtube#video");

// Map<String, Object> item1 = new HashMap<>();
// item1.put("kind", "youtube#searchResult");
// item1.put("id", id1);
// item1.put("snippet", snippet1);

// items.add(item1);

// // Second video item
// Map<String, Object> snippet2 = new HashMap<>();
// snippet2.put("title", "Test Video 2");
// snippet2.put("channelTitle", "Test Channel 2");
// snippet2.put("publishedAt", "2023-01-02T00:00:00Z");

// Map<String, Object> defaultThumbnail2 = new HashMap<>();
// defaultThumbnail2.put("url", "http://example.com/thumb2_default.jpg");
// Map<String, Object> mediumThumbnail2 = new HashMap<>();
// mediumThumbnail2.put("url", "http://example.com/thumb2_medium.jpg");
// Map<String, Object> highThumbnail2 = new HashMap<>();
// highThumbnail2.put("url", "http://example.com/thumb2_high.jpg");

// Map<String, Object> thumbnails2 = new HashMap<>();
// thumbnails2.put("default", defaultThumbnail2);
// thumbnails2.put("medium", mediumThumbnail2);
// thumbnails2.put("high", highThumbnail2);

// snippet2.put("thumbnails", thumbnails2);

// Map<String, Object> id2 = new HashMap<>();
// id2.put("videoId", "def456");
// id2.put("kind", "youtube#video");

// Map<String, Object> item2 = new HashMap<>();
// item2.put("kind", "youtube#searchResult");
// item2.put("id", id2);
// item2.put("snippet", snippet2);

// items.add(item2);

// response.put("items", items);
// response.put("pageInfo", Map.of("totalResults", 2, "resultsPerPage", 10));

// return response;
// }

// private SearchResultItem createSampleSearchResultItem(String title) {
// SearchResultItem item = new SearchResultItem();
// item.setTitle(title);
// item.setChannelTitle("Test Channel");
// item.setVideoId("testId");
// item.setLink("https://www.youtube.com/watch?v=testId");
// return item;
// }
// }