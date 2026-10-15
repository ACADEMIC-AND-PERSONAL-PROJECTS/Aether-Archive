-- Aether Archive — schema baseline (E1-S3).
--
-- PostgreSQL 17, versioned by Flyway; Hibernate runs with ddl-auto=validate and never changes the
-- schema, so every table and column name here has to match the entity mappings exactly
-- (domain/ArchiveItem, domain/Photo). Timestamps are `timestamptz` (UTC instants), identifiers are
-- assigned by the application — never by the database — because the storage layout and the API
-- responses need the id before the row is written (ADR-009, ADR-011).

CREATE TABLE archive_item
(
    id               uuid        NOT NULL,
    type             varchar(20) NOT NULL,
    title            varchar(80),
    "timestamp"      timestamptz NOT NULL,
    background_color varchar(7)  NOT NULL,
    CONSTRAINT pk_archive_item PRIMARY KEY (id),
    -- The "aura" of a dump, used as the river background: always a full #RRGGBB triple.
    CONSTRAINT ck_archive_item_background_color CHECK (background_color ~ '^#[0-9a-fA-F]{6}$')
);

-- The river feed: newest first, id descending as the stable tiebreaker for equal timestamps.
CREATE INDEX idx_archive_item_river ON archive_item ("timestamp" DESC, id DESC);

CREATE TABLE photo
(
    id              uuid         NOT NULL,
    archive_item_id uuid,
    local_file_path varchar(255) NOT NULL,
    display_order   integer,
    category        varchar(20)  NOT NULL,
    created_at      timestamptz  NOT NULL,
    CONSTRAINT pk_photo PRIMARY KEY (id),
    -- Nullable on purpose: an upload exists before it is curated into an item (ADR-011).
    CONSTRAINT fk_photo_archive_item FOREIGN KEY (archive_item_id) REFERENCES archive_item (id),
    -- A dump holds exactly six photos, ordered 0–5; the service enforces it, the database refuses
    -- to store anything else.
    CONSTRAINT ck_photo_display_order_range CHECK (display_order IS NULL OR display_order BETWEEN 0 AND 5)
);

-- Supports the foreign key and the by-item lookup of a dump.
CREATE INDEX idx_photo_archive_item_id ON photo (archive_item_id);

-- One position per item. Unassigned photos (display_order IS NULL) stay outside the constraint.
CREATE UNIQUE INDEX uk_photo_archive_item_display_order
    ON photo (archive_item_id, display_order)
    WHERE display_order IS NOT NULL;
