package com.aibizarchitect.nexus.v1.spring.search;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

@Document(collection = "search_results_cache")
public class SearchResultsCacheEntry {
    
    @Id
    private String id;
    
    private String query;
    
    private List<SearchResultItem> items;
    
    private Instant timestamp;
    
    private Instant expiresAt;

    public SearchResultsCacheEntry() {
        this.timestamp = Instant.now();
    }

    public SearchResultsCacheEntry(String query, List<SearchResultItem> items, long ttlMinutes) {
        this.query = query;
        this.items = items;
        this.timestamp = Instant.now();
        this.expiresAt = this.timestamp.plusSeconds(ttlMinutes * 60);
    }

    // Getters and setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public List<SearchResultItem> getItems() {
        return items;
    }

    public void setItems(List<SearchResultItem> items) {
        this.items = items;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public boolean isExpired() {
        return expiresAt != null && Instant.now().isAfter(expiresAt);
    }
}