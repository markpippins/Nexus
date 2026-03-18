package com.angrysurfer.spring.nexus.user;

import java.io.Serializable;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * User Registration Data Transfer Object.
 * Simplified version without social media fields (deprecated).
 */
@Data
@NoArgsConstructor
public class UserRegistrationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;
    private String alias;
    private String identifier;
    private String email;
    private String avatarUrl;
    private boolean admin;
    
    // REMOVED social media fields (deprecated):
    // - followers, following, friends
    // - groups, interests, organizations
    // - projects, roles, teams, tags
}
