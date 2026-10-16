package com.aetherarchive.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.Photo;

/**
 * A dump as the contract describes it: the {@code Dump} schema of {@code _docs/openapi.yml}, and nothing
 * else (ADR-011).
 *
 * <p><strong>The curation order is the position in {@link #photos}, not a field.</strong> The contract's
 * {@code Photo} schema has no {@code displayOrder}, so none is published: the position each photo holds is
 * stored server-side ({@code Photo.displayOrder}) and used to hand the six over in the order the
 * publishing request named them, which is what {@code photos[0..5]} means to a client. A later reader
 * should not "fix" this by adding a field — that would publish something the contract does not describe
 * (ADR-011 §3).
 *
 * <p>Nothing of the entity crosses this boundary either: the item's {@code type} stays in the process, and
 * the photos are published as {@link PhotoResponse}, which carries neither the item they belong to nor
 * their position in it.
 *
 * @param id the dump's identifier
 * @param title its name, or null when it was published without one
 * @param backgroundColor the aura of the dump, {@code #RRGGBB}
 * @param photos its six photos, in the order the dump displays them
 * @param createdAt when the dump was published, UTC — the entity's {@code timestamp}
 */
public record DumpResponse(UUID id, String title, String backgroundColor, List<PhotoResponse> photos,
        Instant createdAt) {

    /**
     * The published form of a dump, given the photos in the order they are displayed in.
     *
     * @param dump a persisted archive item of type {@code MONTHLY_DUMP}
     * @param photos its photos, already in curation order
     * @return the five fields of the contract's schema
     */
    public static DumpResponse from(ArchiveItem dump, List<Photo> photos) {
        return new DumpResponse(dump.getId(), dump.getTitle(), dump.getBackgroundColor(),
                photos.stream().map(PhotoResponse::from).toList(), dump.getTimestamp());
    }
}
