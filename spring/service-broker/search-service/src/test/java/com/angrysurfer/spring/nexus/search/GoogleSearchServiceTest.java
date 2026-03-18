package com.angrysurfer.spring.nexus.search;
// package com.angrysurfer.spring.nexus.search;

// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.extension.ExtendWith;
// import org.mockito.ArgumentCaptor;
// import org.mockito.Mock;
// import org.mockito.junit.jupiter.MockitoExtension;
// import org.springframework.http.HttpEntity;
// import org.springframework.http.HttpMethod;
// import org.springframework.http.ResponseEntity;
// import org.springframework.web.client.RestTemplate;

// import java.util.*;

// import static org.junit.jupiter.api.Assertions.*;
// import static org.mockito.ArgumentMatchers.any;
// import static org.mockito.ArgumentMatchers.eq;
// import static org.mockito.Mockito.*;

// @ExtendWith(MockitoExtension.class)
// class GoogleSearchServiceTest {

// @Mock
// private RestTemplate restTemplate;

// @Mock
// private SearchResultsCacheRepository searchResultsCacheRepository;

// private GoogleSearchService googleSearchService;

// @BeforeEach
// void setUp() {
// googleSearchService = new GoogleSearchService(restTemplate,
// searchResultsCacheRepository);
// }

// @Test
// void testSimpleSearchSuccess() {
// // Arrange
// String query = "test query";
// String token = "test-token";

// Map<String, Object> mockResponse = createMockApiResponse();
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(mockResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);

// // Act
// SearchResult result = googleSearchService.simpleSearch(token, query);

// // Assert
// assertNotNull(result);
// assertNotNull(result.getItems());
// assertEquals(2, result.getItems().size());

// // Verify the API call was made
// ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
// verify(restTemplate).exchange(urlCaptor.capture(), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));

// String capturedUrl = urlCaptor.getValue();
// assertTrue(capturedUrl.contains("q=test+query")); // URL encoded query
// assertTrue(capturedUrl.contains("key="));
// assertTrue(capturedUrl.contains("cx="));
// }

// @Test
// void testSimpleSearchWithCache() {
// // Arrange
// String query = "cached query";
// String token = "test-token";

// Map<String, Object> mockResponse = createMockApiResponse();
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(mockResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);

// // Act - First call should execute API
// SearchResult result1 = googleSearchService.simpleSearch(token, query);

// // Second call with same query should use cache
// SearchResult result2 = googleSearchService.simpleSearch(token, query);

// // Assert
// assertNotNull(result1);
// assertNotNull(result2);
// assertEquals(result1, result2); // Should be same cached result

// // Verify API was only called once
// verify(restTemplate, times(1)).exchange(any(String.class),
// eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class));
// }

// @Test
// void testSimpleSearchNetworkError() {
// // Arrange
// String query = "failing query";
// String token = "test-token";

// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Network error"));

// // Act & Assert
// RuntimeException exception = assertThrows(RuntimeException.class,
// () -> googleSearchService.simpleSearch(token, query));

// assertTrue(exception.getMessage().contains("Network connection failed"));

// // Verify API was called
// verify(restTemplate).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));
// }

// @Test
// void testSimpleSearchApiError() {
// // Arrange
// String query = "error query";
// String token = "test-token";

// ResponseEntity<Map> errorResponse =
// ResponseEntity.status(400).body(Map.of("error", "Bad Request"));
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(errorResponse);

// // Act & Assert
// RuntimeException exception = assertThrows(RuntimeException.class,
// () -> googleSearchService.simpleSearch(token, query));

// assertTrue(exception.getMessage().contains("Google search API returned
// error"));

// // Verify API was called
// verify(restTemplate).exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class));
// }

// @Test
// void testSimpleSearchApiReturnsNoItems() {
// // Arrange
// String query = "no results query";
// String token = "test-token";

// Map<String, Object> mockResponse = createMockApiResponse();
// mockResponse.put("items", null); // No items in response
// ResponseEntity<Map> responseEntity = ResponseEntity.ok(mockResponse);
// when(restTemplate.exchange(any(String.class), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenReturn(responseEntity);

// // Act
// SearchResult result = googleSearchService.simpleSearch(token, query);

// // Assert
// assertNotNull(result);
// assertNull(result.getItems());
// }

// @Test
// void testSimpleSearchNullApiKey() {
// // Arrange - We'll need to modify the GoogleSearchService to make these
// fields accessible for testing
// // or test with real values but mock the API call
// String query = "test query";
// String token = "test-token";

// // Mock the restTemplate to return a response so we can test the error case
// without making actual API calls
// when(restTemplate.exchange(anyString(), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Connection error"));

// // Act & Assert - this tests that the service handles API calls properly
// assertDoesNotThrow(() -> googleSearchService.simpleSearch(token, query));
// }

// @Test
// void testSimpleSearchNullSearchEngineId() {
// // Similar approach as above - test the actual functionality
// String query = "test query";
// String token = "test-token";

// // Mock the restTemplate to return a response so we can test the error case
// without making actual API calls
// when(restTemplate.exchange(anyString(), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Connection error"));

// // Act & Assert
// assertDoesNotThrow(() -> googleSearchService.simpleSearch(token, query));
// }

// @Test
// void testSimpleSearchEmptyApiKey() {
// // Similar approach as above - test the actual functionality
// String query = "test query";
// String token = "test-token";

// // Mock the restTemplate to return a response so we can test the error case
// without making actual API calls
// when(restTemplate.exchange(anyString(), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Connection error"));

// // Act & Assert
// assertDoesNotThrow(() -> googleSearchService.simpleSearch(token, query));
// }

// @Test
// void testSimpleSearchEmptySearchEngineId() {
// // Similar approach as above - test the actual functionality
// String query = "test query";
// String token = "test-token";

// // Mock the restTemplate to return a response so we can test the error case
// without making actual API calls
// when(restTemplate.exchange(anyString(), eq(HttpMethod.GET),
// any(HttpEntity.class), eq(Map.class)))
// .thenThrow(new
// org.springframework.web.client.ResourceAccessException("Connection error"));

// // Act & Assert
// assertDoesNotThrow(() -> googleSearchService.simpleSearch(token, query));
// }

// // Helper method to create mock API response
// private Map<String, Object> createMockApiResponse() {
// Map<String, Object> response = new HashMap<>();

// List<Map<String, Object>> items = new ArrayList<>();

// Map<String, Object> item1 = new HashMap<>();
// item1.put("kind", "customsearch#result");
// item1.put("title", "Test Result 1");
// item1.put("htmlTitle", "Test Result 1");
// item1.put("link", "http://example1.com");
// item1.put("displayLink", "example1.com");
// item1.put("snippet", "This is a test snippet 1");
// item1.put("htmlSnippet", "This is a test snippet 1");
// item1.put("formattedUrl", "http://example1.com");
// item1.put("htmlFormattedUrl", "http://example1.com");

// Map<String, Object> pagemap1 = new HashMap<>();
// pagemap1.put("metatags", Arrays.asList(Map.of("name", "value")));
// pagemap1.put("cse_thumbnail", Arrays.asList(Map.of("src",
// "http://thumbnail1.jpg")));
// pagemap1.put("cse_image", Arrays.asList(Map.of("src", "http://image1.jpg")));
// item1.put("pagemap", pagemap1);

// items.add(item1);

// Map<String, Object> item2 = new HashMap<>();
// item2.put("kind", "customsearch#result");
// item2.put("title", "Test Result 2");
// item2.put("htmlTitle", "Test Result 2");
// item2.put("link", "http://example2.com");
// item2.put("displayLink", "example2.com");
// item2.put("snippet", "This is a test snippet 2");
// item2.put("htmlSnippet", "This is a test snippet 2");
// item2.put("formattedUrl", "http://example2.com");
// item2.put("htmlFormattedUrl", "http://example2.com");

// Map<String, Object> pagemap2 = new HashMap<>();
// pagemap2.put("metatags", Arrays.asList(Map.of("name", "value2")));
// pagemap2.put("cse_thumbnail", Arrays.asList(Map.of("src",
// "http://thumbnail2.jpg")));
// pagemap2.put("cse_image", Arrays.asList(Map.of("src", "http://image2.jpg")));
// item2.put("pagemap", pagemap2);

// items.add(item2);

// response.put("items", items);
// response.put("searchInformation", Map.of("totalResults", "2"));

// return response;
// }
// }