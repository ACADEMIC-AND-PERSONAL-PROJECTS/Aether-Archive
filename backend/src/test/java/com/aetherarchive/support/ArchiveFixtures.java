package com.aetherarchive.support;

import java.time.Instant;
import java.util.UUID;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.domain.PhotoCategory;

/**
 * Test data for the persistence tests.
 *
 * <p>Deterministic on purpose: identifiers and instants are fixed values, never generated, so an
 * assertion can name the row it expects instead of relying on the order rows happened to arrive in —
 * and so a failing test reproduces exactly.
 */
public final class ArchiveFixtures {

    /** A UTC instant; its seconds and nanos are non-zero to catch a truncated or shifted round trip. */
    public static final Instant CREATED_AT = Instant.parse("2026-10-15T09:30:45.123456Z");

    public static final String BACKGROUND_COLOR = "#1B2A41";

    private ArchiveFixtures() {
    }

    /** Fixed, readable identifiers: {@code id(3)} is {@code 00000000-0000-0000-0000-000000000003}. */
    public static UUID id(long value) {
        return new UUID(0L, value);
    }

    public static ArchiveItem item(UUID id) {
        return item(id, CREATED_AT);
    }

    public static ArchiveItem item(UUID id, Instant timestamp) {
        return new ArchiveItem(id, ItemType.MONTHLY_DUMP, "Late Summer", timestamp, BACKGROUND_COLOR);
    }

    /** A single picture without a name: {@code title} is optional in the contract (ADR-011). */
    public static ArchiveItem itemWithoutTitle(UUID id) {
        return new ArchiveItem(id, ItemType.SINGLE_PIC, null, CREATED_AT, BACKGROUND_COLOR);
    }

    public static Photo photo(UUID id, ArchiveItem item, Integer displayOrder) {
        return photo(id, item, displayOrder, PhotoCategory.DUMP, CREATED_AT);
    }

    public static Photo photo(UUID id, ArchiveItem item, Integer displayOrder, PhotoCategory category,
            Instant createdAt) {
        return new Photo(id, item, "images/" + id + ".jpg", displayOrder, category, createdAt);
    }

    /** An upload before curation: no item and no position yet (ADR-011). */
    public static Photo unassignedPhoto(UUID id) {
        return new Photo(id, null, "images/" + id + ".jpg", null, PhotoCategory.PICS, CREATED_AT);
    }
}
