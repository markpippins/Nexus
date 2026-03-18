package com.angrysurfer.spring.nexus.note;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NoteRepository extends MongoRepository<Note, String> {
    
    Optional<Note> findByUserIdAndSourceAndKey(String userId, String source, String key);
    
    List<Note> findByUserId(String userId);
    
    void deleteByUserIdAndSourceAndKey(String userId, String source, String key);
    
    List<Note> findBySource(String source);
    
    List<Note> findByUserIdAndSource(String userId, String source);
}