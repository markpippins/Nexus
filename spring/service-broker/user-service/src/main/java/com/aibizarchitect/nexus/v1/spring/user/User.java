package com.aibizarchitect.nexus.v1.spring.user;

import java.io.Serializable;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import com.aibizarchitect.nexus.v1.user.UserDTO;

/**
 * User entity for MongoDB.
 * DEPRECATED: This service is being phased out.
 * Use user-access-service (MySQL) for user authentication.
 */
@Document(collection = "users")
public class User implements Serializable {

    private static final long serialVersionUID = 2747813660378401172L;

    @Id
    private String id;

    private String identifier;

    private boolean admin = false;

    private String alias;

    private String email;

    private String avatarUrl = "https://picsum.photos/50/50";

    /**
     * Convert to DTO - simplified for deprecated social media fields
     */
    public UserDTO toDTO() {
        UserDTO dto = new UserDTO();
        dto.setId(getId());
        dto.setAlias(getAlias());
        dto.setEmail(getEmail());
        dto.setAdmin(isAdmin());
        dto.setAvatarUrl(getAvatarUrl());
        // Note: identifier not included in DTO for security
        // Note: social media fields (followers, following, friends) removed -
        // deprecated
        return dto;
    }

    public User() {
    }

    public User(String alias, String email, String avatarUrl) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
    }

    public User(String alias, String email, String avatarUrl, String identifier) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
        setIdentifier(identifier);
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public String getIdentifier() {
        return identifier;
    }

    public void setIdentifier(String identifier) {
        this.identifier = identifier;
    }

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }
}
