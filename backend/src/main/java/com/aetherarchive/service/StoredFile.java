package com.aetherarchive.service;

import java.util.Objects;
import java.util.UUID;

/**
 * Where an upload was stored: the name the archive gave it, never the one the client sent.
 *
 * <p>A service value, not a persistent entity — {@code domain/} holds the JPA entities and enums, and
 * this is the outcome of a single storage operation. {@link #relativePath()} is what the caller keeps as
 * {@code Photo.localFilePath}: relative to the data directory, forward slashes, no leading slash
 * (ADR-011).
 *
 * @param id the generated identifier, also the UUID part of the stored file name
 * @param extension the canonical extension of the sniffed format, without the dot
 * @param relativePath the stored file's path relative to the data directory, for example
 *     {@code images/8f14e45f-ceea-467a-9e4a-1c7f0f2b8d31.jpg}
 */
public record StoredFile(UUID id, String extension, String relativePath) {

    public StoredFile {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(extension, "extension");
        Objects.requireNonNull(relativePath, "relativePath");
    }
}
