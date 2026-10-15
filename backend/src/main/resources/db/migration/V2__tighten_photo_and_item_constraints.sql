-- Aether Archive — close the gaps the E1-S3 review found in the baseline (V1).
--
-- What V1__baseline.sql enforces, exactly: a display_order lies between 0 and 5, and one item holds a
-- given position at most once. What it does *not* enforce, whatever its comments suggested:
--
--   * six is not a database rule: the check only bounds a position, the unique index only keeps
--     positions unique within an item, and a photo without any position is legal (an upload,
--     ADR-011). "A dump holds exactly six photos" is the dump service's cardinality rule, mirrored
--     by the tests, not a schema fact this migration can turn into one — SQL cannot count rows.
--   * a position without an item is legal: the unique index is partial (WHERE display_order IS NOT
--     NULL), so a "positioned orphan" (archive_item_id IS NULL, display_order = 3) is stored without
--     protest, and no index would notice a second one.
--   * both enum columns are plain varchar(20): nothing ties their values to the constants of
--     domain/ItemType and domain/PhotoCategory, so a value no enum has ever produced survives until
--     it is read back.
--
-- This migration closes the last two. From here on, adding a constant to either enum is a schema
-- change: the checks below list the accepted names, and a new name needs a new migration.

ALTER TABLE archive_item
    ADD CONSTRAINT ck_archive_item_type CHECK (type IN ('SINGLE_PIC', 'ANIME', 'MONTHLY_DUMP'));

ALTER TABLE photo
    ADD CONSTRAINT ck_photo_category CHECK (category IN ('PICS', 'ANIME', 'DUMP', 'UNCATEGORIZED')),
    -- A position is a place inside an item; without the item it means nothing.
    ADD CONSTRAINT ck_photo_position_requires_item
        CHECK (archive_item_id IS NOT NULL OR display_order IS NULL);
