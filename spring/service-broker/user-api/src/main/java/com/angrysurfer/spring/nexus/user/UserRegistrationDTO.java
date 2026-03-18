package com.angrysurfer.spring.nexus.user;

import java.io.Serializable;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * User Registration Data Transfer Object.
 */
@Data
@NoArgsConstructor
public class UserRegistrationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;
    private String alias;
    private String email;
    private boolean admin;
}
