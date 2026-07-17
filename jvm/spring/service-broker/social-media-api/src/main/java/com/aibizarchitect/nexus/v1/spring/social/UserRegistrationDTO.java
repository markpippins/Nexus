package com.aibizarchitect.nexus.v1.spring.social;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class UserRegistrationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private static final String TYPE = "user";

	private String id;

    private String alias;

    private String identifier;

    private String email;

    private String avatarUrl;

    private Set<String> followers = new HashSet<>();

    private Set<String> following = new HashSet<>();

    private Set<String> friends = new HashSet<>();

    private Set<String> groups = new HashSet<>();

    private Set<String> interests = new HashSet<>();

    private Set<String> organizations = new HashSet<>();

    private Set<String> projects = new HashSet<>();

    private Set<String> roles = new HashSet<>();

    private Set<String> teams = new HashSet<>();

    private Set<String> tags = new HashSet<>();

    private boolean admin;
}
