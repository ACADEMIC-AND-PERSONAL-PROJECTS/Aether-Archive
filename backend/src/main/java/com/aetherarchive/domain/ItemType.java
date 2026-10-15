package com.aetherarchive.domain;

/**
 * What an {@link ArchiveItem} is: a single picture, an anime still or a monthly dump of six photos.
 *
 * <p>Persisted as the enum <em>name</em> ({@code STRING}), so renaming a constant is a schema
 * change. The type is not part of the HTTP contract — no response in {@code _docs/openapi.yml}
 * exposes it — so no wire value is defined here; only {@code MONTHLY_DUMP} is created in Sprint 1,
 * the other two arrive with the river feed (E5-S1).
 */
public enum ItemType {

    SINGLE_PIC,
    ANIME,
    MONTHLY_DUMP
}
