package com.aetherarchive.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A curated entry of the archive: a single picture, an anime still or a monthly dump of six photos.
 *
 * <p>Not a record: JPA rehydrates a row through a no-argument constructor and needs non-final state,
 * so the fields stay private and mutable while the class exposes them read-only. The identifier is
 * assigned in Java (no {@code @GeneratedValue}) because the caller must know it before the insert —
 * the data directory layout and the response bodies are built from it (ADR-009).
 *
 * <p>Table and column names are written out explicitly: {@code db/migration/V1__baseline.sql} owns
 * the schema and Hibernate only validates it, so a silent rename by a naming strategy would break
 * the boot.
 *
 * <p>The constructor enforces the {@code NOT NULL} columns of the baseline; the remaining rules
 * (colour format, title length) are the service's job on the way in and the database's as the last
 * line of defence.
 */
@Entity
@Table(name = "archive_item")
public class ArchiveItem {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private ItemType type;

    /** Optional: a dump may be published without a name. */
    @Column(name = "title", length = 80)
    private String title;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    /** The "aura" of the item, {@code #RRGGBB}, drawn behind the river. */
    @Column(name = "background_color", nullable = false, length = 7)
    private String backgroundColor;

    /** Required by JPA; application code creates items through the constructor below. */
    protected ArchiveItem() {
    }

    public ArchiveItem(UUID id, ItemType type, String title, Instant timestamp, String backgroundColor) {
        this.id = Objects.requireNonNull(id, "id");
        this.type = Objects.requireNonNull(type, "type");
        this.title = title;
        this.timestamp = Objects.requireNonNull(timestamp, "timestamp");
        this.backgroundColor = Objects.requireNonNull(backgroundColor, "backgroundColor");
    }

    public UUID getId() {
        return id;
    }

    public ItemType getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getBackgroundColor() {
        return backgroundColor;
    }
}
