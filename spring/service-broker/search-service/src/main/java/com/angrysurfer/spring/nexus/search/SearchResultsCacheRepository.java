package com.angrysurfer.spring.nexus.search;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SearchResultsCacheRepository extends MongoRepository<SearchResultsCacheEntry, String> {
    
    @Query("{'query': ?0}")
    Optional<SearchResultsCacheEntry> findByQuery(String query);
    
    @Query("{'expiresAt': {$lt: ?0}}")
    java.util.List<SearchResultsCacheEntry> findExpiredEntries(java.time.Instant currentTime);
}