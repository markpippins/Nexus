package com.aibizarchitect.nexus.v1.spring.social;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ProfileDTO implements Serializable {

    /**
     *
     */
    private static final long serialVersionUID = 1L;

	private String id;

    private String firstName;

    private String lastName;

    private String city;

    private String state;

    private String profileImageUrl;

    private Set<String> interests = new HashSet<>();

    private Set<String> skills = new HashSet<>();

    private Set<String> languages = new HashSet<>();

    private Set<String> certifications = new HashSet<>();

    private Set<String> publications = new HashSet<>();

    private Set<String> projects = new HashSet<>();

    private Set<String> experiences = new HashSet<>();

    private Set<String> educations = new HashSet<>();
    
}
