package com.aibizarchitect.nexus.core.v1;

/**
 * Canonical binary data abstraction for core models.
 * Implementations are provided by framework adapters.
 */
public interface BinaryData {
    /** Return a base64-encoded representation of the binary data. */
    String toBase64();
}
