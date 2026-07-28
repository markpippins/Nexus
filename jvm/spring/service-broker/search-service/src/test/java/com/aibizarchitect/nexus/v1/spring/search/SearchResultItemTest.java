package com.aibizarchitect.nexus.v1.spring.search;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SearchResultItem")
class SearchResultItemTest {

    @Nested
    @DisplayName("GreenPath - field accessors")
    class GreenPath {
        @Test @DisplayName("general search fields")
        void generalFields() {
            SearchResultItem item = new SearchResultItem();
            item.setKind("customsearch#result");
            item.setTitle("Java Tutorial");
            item.setLink("https://example.com");
            item.setSnippet("Learn Java...");
            item.setFormattedUrl("example.com");

            assertEquals("Java Tutorial", item.getTitle());
            assertEquals("https://example.com", item.getLink());
            assertEquals("customsearch#result", item.getKind());
        }

        @Test @DisplayName("YouTube-specific fields")
        void youTubeFields() {
            SearchResultItem item = new SearchResultItem();
            item.setVideoId("dQw4w9WgXcQ");
            item.setChannelTitle("Music Channel");
            item.setDuration("PT3M33S");
            item.setViewCount(1000000);
            item.setChannelId("UC123");
            item.setThumbnailUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg");

            assertEquals("dQw4w9WgXcQ", item.getVideoId());
            assertEquals("Music Channel", item.getChannelTitle());
            assertEquals(Integer.valueOf(1000000), item.getViewCount());
            assertEquals("UC123", item.getChannelId());
        }

        @Test @DisplayName("Unsplash-specific fields")
        void unsplashFields() {
            SearchResultItem item = new SearchResultItem();
            item.setRegularImageUrl("https://images.unsplash.com/photo-1?q=80");
            item.setSmallImageUrl("https://images.unsplash.com/photo-1?q=80&w=400");
            item.setPhotographerName("John Doe");
            item.setPhotographerUsername("johndoe");
            item.setWidth(1920);
            item.setHeight(1080);
            item.setDownloadCount(500);
            item.setTags(List.of("nature", "landscape"));

            assertEquals("John Doe", item.getPhotographerName());
            assertEquals(Integer.valueOf(1920), item.getWidth());
            assertEquals(Integer.valueOf(1080), item.getHeight());
            assertEquals(Integer.valueOf(500), item.getDownloadCount());
            assertEquals(2, item.getTags().size());
        }

        @Test @DisplayName("Gemini-specific fields")
        void geminiFields() {
            SearchResultItem item = new SearchResultItem();
            item.setPrompt("Explain quantum computing");
            item.setGeneratedText("Quantum computing uses qubits...");
            item.setModelUsed("gemini-2.0-flash");
            item.setMaxOutputTokens(2048);
            item.setTemperature(0.7);
            item.setMimeType("text/plain");

            assertEquals("Explain quantum computing", item.getPrompt());
            assertEquals("gemini-2.0-flash", item.getModelUsed());
            assertEquals(Integer.valueOf(2048), item.getMaxOutputTokens());
            assertEquals(0.7, item.getTemperature(), 0.01);
        }
    }

    @Nested
    @DisplayName("OrangePath - edge cases")
    class OrangePath {
        @Test @DisplayName("empty strings allowed")
        void empty_strings() {
            SearchResultItem item = new SearchResultItem();
            item.setTitle("");
            item.setSnippet("");

            assertEquals("", item.getTitle());
            assertEquals("", item.getSnippet());
        }

        @Test @DisplayName("null lists allowed")
        void null_lists() {
            SearchResultItem item = new SearchResultItem();
            assertNull(item.getTags());
        }
    }

    @Nested
    @DisplayName("RedPath - no-validation GAPs")
    class RedPath {
        @Test @DisplayName("negative viewCount allowed (no validation)")
        void negative_viewCount() {
            SearchResultItem item = new SearchResultItem();
            item.setViewCount(-1);

            assertEquals(Integer.valueOf(-1), item.getViewCount());
        }

        @Test @DisplayName("temperature outside [0,1] allowed (no validation)")
        void temperature_out_of_range() {
            SearchResultItem item = new SearchResultItem();
            item.setTemperature(99.0);

            assertEquals(99.0, item.getTemperature(), 0.01);
        }
    }
}
