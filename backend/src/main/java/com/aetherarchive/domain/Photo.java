package com.aetherarchive.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * A stored image, and — once curated — one of the six photos of a dump.
 *
 * <p>An upload is created <em>unassigned</em>: {@code archiveItem} and {@code displayOrder} are null
 * until a dump is published, which is when the item is created and the six photos are attached in
 * order (ADR-011). That is why both columns are nullable in the baseline.
 *
 * <p>Not a record, for the same reason as {@link ArchiveItem}: JPA needs a no-argument constructor
 * and non-final state, and the identifier is assigned in Java so the stored file name and the
 * database row cannot disagree.
 *
 * <p>The rules around placement (exactly six photos, order 0–5 and unique within a dump) belong to
 * the dump service; the baseline's check and unique index refuse anything that slips through.
 */
@Entity
@Table(name = "photo")
public class Photo {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** Null while the photo is uploaded but not yet part of a dump or a single-picture item. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "archive_item_id")
    private ArchiveItem archiveItem;

    /** Relative to the data directory, e.g. {@code images/<uuid>.jpg}; never an absolute path. */
    @Column(name = "local_file_path", nullable = false, length = 255)
    private String localFilePath;

    /** 0-based position inside the dump, null while unassigned. */
    @Column(name = "display_order")
    private Integer displayOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private PhotoCategory category;

    /** When the upload happened; serialised as {@code uploadedAt} on the wire (ADR-011). */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * The optimistic-locking counter, handled by Hibernate: curation updates rows an upload created, so
     * two writers could otherwise overwrite each other's work without a word — one of them would publish
     * a dump whose photo the other had just taken. The version is written on every insert, raised on
     * every update and compared with the row before the next one, which turns the race into a failed
     * transaction (V3__photo_optimistic_locking.sql).
     */
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /** Required by JPA; application code creates photos through the constructor below. */
    protected Photo() {
    }

    public Photo(UUID id, ArchiveItem archiveItem, String localFilePath, Integer displayOrder,
            PhotoCategory category, Instant createdAt) {
        this.id = Objects.requireNonNull(id, "id");
        this.archiveItem = archiveItem;
        this.localFilePath = Objects.requireNonNull(localFilePath, "localFilePath");
        this.displayOrder = displayOrder;
        this.category = Objects.requireNonNull(category, "category");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
    }

    /**
     * Curates this photo into a dump, at the position it is displayed in — the only change a photo
     * ever undergoes after its upload (ADR-011).
     *
     * <p>{@code DumpService} calls it once per photo, in the order the request named the identifiers,
     * which is what turns six ids into the ordered array the contract publishes. Both curation columns
     * are set together because the baseline accepts them only together
     * ({@code ck_photo_position_requires_item}), and the caller is responsible for handing over an
     * unassigned photo: a photo already curated into another item is refused by the service, and this
     * method would replace that assignment rather than complain about it.
     *
     * @param item the dump or single-picture item this photo becomes part of
     * @param displayOrder its 0-based position inside that item
     */
    public void attachTo(ArchiveItem item, int displayOrder) {
        this.archiveItem = Objects.requireNonNull(item, "item");
        this.displayOrder = displayOrder;
    }

    public UUID getId() {
        return id;
    }

    public ArchiveItem getArchiveItem() {
        return archiveItem;
    }

    public String getLocalFilePath() {
        return localFilePath;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public PhotoCategory getCategory() {
        return category;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
