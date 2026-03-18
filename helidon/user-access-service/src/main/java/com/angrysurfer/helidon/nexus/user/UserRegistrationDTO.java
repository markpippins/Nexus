package com.angrysurfer.helidon.nexus.user;

import java.io.Serializable;

public class UserRegistrationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String id;

    private String alias;

    private String email;

    private boolean admin;

    public UserRegistrationDTO() {
    }

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

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }
}
