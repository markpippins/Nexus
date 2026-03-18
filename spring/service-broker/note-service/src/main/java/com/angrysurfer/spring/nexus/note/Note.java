package com.angrysurfer.spring.nexus.note;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "notes")
public class Note {
    
    @Id
    private String id;
    private String userId;
    private String source;
    private String key;
    private String content;
    
    // Default constructor
    public Note() {}
    
    // Constructor with all fields
    public Note(String userId, String source, String key, String content) {
        this.userId = userId;
        this.source = source;
        this.key = key;
        this.content = content;
    }
    
    // Getters and setters
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getUserId() {
        return userId;
    }
    
    public void setUserId(String userId) {
        this.userId = userId;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public String getKey() {
        return key;
    }
    
    public void setKey(String key) {
        this.key = key;
    }
    
    public String getContent() {
        return content;
    }
    
    public void setContent(String content) {
        this.content = content;
    }
}