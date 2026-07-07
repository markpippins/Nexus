package com.aibizarchitect.nexus.v1.spring.social;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ForumDTO implements Serializable {

    /**
     *
     */
    private static final long serialVersionUID = 1l;

    private String id;

    private String name;

    private Set<UserDTO> members = new HashSet<>();
}
