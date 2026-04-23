package com.aibizarchitect.nexus.v1.user;

import java.io.Serializable;
import java.util.Objects;

/**
 * User Registration Data Transfer Object.
 * Framework-agnostic DTO shared across Spring, Helidon, and Quarkus implementations.
 */
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

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof UserRegistrationDTO that)) {
            return false;
        }
        return admin == that.admin
                && Objects.equals(id, that.id)
                && Objects.equals(alias, that.alias)
                && Objects.equals(email, that.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, alias, email, admin);
    }
}
