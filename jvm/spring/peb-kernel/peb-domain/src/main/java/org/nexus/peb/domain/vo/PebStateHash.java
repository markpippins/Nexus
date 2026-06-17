package org.nexus.peb.domain.vo;

import org.apache.commons.codec.digest.DigestUtils;

import java.util.Objects;

public record PebStateHash(String value) {

    public PebStateHash {
        Objects.requireNonNull(value, "Hash value must not be null");
        if (!value.matches("^[a-f0-9]{64}$")) {
            throw new IllegalArgumentException("Hash must be 64-char hex string: " + value);
        }
    }

    public static PebStateHash compute(String content) {
        return new PebStateHash(DigestUtils.sha256Hex(content));
    }

    public String prefixed() {
        return "sha256:" + value;
    }
}
