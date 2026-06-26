package org.nexus.peb.domain.vo;

import java.util.Objects;

public record CapabilityToken(String value) {

    public CapabilityToken {
        Objects.requireNonNull(value, "Token value must not be null");
        if (!value.startsWith("cap:")) {
            throw new IllegalArgumentException("Token must start with 'cap:'");
        }
    }

    public String action() {
        String[] parts = value.split(":");
        if (parts.length > 1) {
            return parts[1];
        }
        return "";
    }
}
