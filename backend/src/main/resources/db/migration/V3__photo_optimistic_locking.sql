-- Aether Archive — optimistic locking for photo (E1-S7).
--
-- Curation is the first thing in the archive that *updates* a row an upload created: publishing a dump
-- sets archive_item_id and display_order on six photos that already exist. Two writers that read the same
-- photo could otherwise both attach it — the second update wins, the first dump silently loses a photo,
-- and nothing in the schema notices. @Version (domain/Photo) turns that race into a failed transaction
-- instead, which is what `.claude/rules/backend.md` asks for as soon as a story mutates existing rows.
--
-- DEFAULT 0 keeps the rows already in a database valid without a table rewrite; Hibernate writes the
-- column itself on every insert it makes, so the default only ever applies to a raw insert. V1 and V2 are
-- not touched: they are applied, and changing their bytes would break Flyway's checksums.
ALTER TABLE photo
    ADD COLUMN version bigint NOT NULL DEFAULT 0;
