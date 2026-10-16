package com.aetherarchive.dto;

import java.time.Instant;
import java.util.UUID;

import com.aetherarchive.domain.Photo;

/**
 * A photo as the contract describes it: the {@code Photo} schema of {@code _docs/openapi.yml}, and
 * nothing else (ADR-011).
 *
 * <p>Four fields, so no part of the entity — its archive item, its position in a dump, the column
 * names — can reach a client: {@code Photo} stores {@code displayOrder}, the wire weighs the order in
 * the array instead, and the persistence field {@code localFilePath} is published as {@code url}, the
 * relative static path a client can actually fetch.
 *
 * @param id the photo's identifier, the {@code <uuid>} of the stored file name
 * @param url the path the image is served from, {@code /images/<uuid>.<ext>} — relative and static,
 *     never a filesystem location (serving it is E1-S5)
 * @param category the contract's lowercase value, e.g. {@code pics}
 * @param uploadedAt when the upload happened, UTC — the entity's {@code createdAt}
 */
public record PhotoResponse(UUID id, String url, String category, Instant uploadedAt) {

    /** The separator between the relative path's directories, as {@code StoredFile} writes it. */
    private static final String PATH_SEPARATOR = "/";

    /**
     * The published form of a stored photo.
     *
     * @param photo a persisted photo, assigned to an item or still waiting for curation
     * @return the four fields of the contract's schema
     */
    public static PhotoResponse from(Photo photo) {
        return new PhotoResponse(photo.getId(),
                PATH_SEPARATOR + photo.getLocalFilePath(),
                photo.getCategory().wireValue(),
                photo.getCreatedAt());
    }
}
