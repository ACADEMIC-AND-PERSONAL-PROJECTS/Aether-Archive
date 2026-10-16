package com.aetherarchive.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.domain.PhotoCategory;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The photo half of the baseline against a real PostgreSQL (Testcontainers, ADR-009): curation
 * order, the unassigned upload, and the rules the dump service will rely on.
 */
@DataJpaTest
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=repository")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestConfiguration.class)
class PhotoRepositoryTest {

    @Autowired
    private PhotoRepository photos;

    @Autowired
    private ArchiveItemRepository items;

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void should_read_back_every_field_when_a_photo_is_persisted() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(1)));
        Photo photo = ArchiveFixtures.photo(ArchiveFixtures.id(10), dump, 3);
        photos.saveAndFlush(photo);
        entityManager.clear();

        Photo reloaded = photos.findById(photo.getId()).orElseThrow();

        assertThat(reloaded.getArchiveItem().getId()).isEqualTo(dump.getId());
        assertThat(reloaded.getLocalFilePath()).isEqualTo("images/" + photo.getId() + ".jpg");
        assertThat(reloaded.getDisplayOrder()).isEqualTo(3);
        assertThat(reloaded.getCategory()).isEqualTo(PhotoCategory.DUMP);
        assertThat(reloaded.getCreatedAt()).isEqualTo(ArchiveFixtures.CREATED_AT);
    }

    @Test
    void should_accept_a_photo_without_item_or_position_when_it_is_not_curated_yet() {
        Photo upload = ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(20));
        photos.saveAndFlush(upload);
        entityManager.clear();

        Photo reloaded = photos.findById(upload.getId()).orElseThrow();

        assertThat(reloaded.getArchiveItem()).isNull();
        assertThat(reloaded.getDisplayOrder()).isNull();
    }

    @Test
    void should_keep_several_photos_without_a_position_when_they_are_all_unassigned() {
        // The unique index only covers rows that have a display_order, so uploads do not collide
        // while they wait to be curated.
        photos.saveAllAndFlush(List.of(
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(21)),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(22)),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(23))));

        assertThat(photos.findAll()).hasSize(3);
    }

    @Test
    void should_return_the_photos_of_one_item_in_curation_order() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(30)));
        ArchiveItem other = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(31)));
        photos.saveAllAndFlush(List.of(
                ArchiveFixtures.photo(ArchiveFixtures.id(35), dump, 5),
                ArchiveFixtures.photo(ArchiveFixtures.id(33), dump, 0),
                ArchiveFixtures.photo(ArchiveFixtures.id(34), dump, 3),
                ArchiveFixtures.photo(ArchiveFixtures.id(36), other, 0),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(37))));

        List<Photo> dumpPhotos = photos.findAllByArchiveItemIdOrderByDisplayOrderAsc(dump.getId());

        assertThat(dumpPhotos).extracting(Photo::getId).containsExactly(
                ArchiveFixtures.id(33), ArchiveFixtures.id(34), ArchiveFixtures.id(35));
        assertThat(dumpPhotos).extracting(Photo::getDisplayOrder).containsExactly(0, 3, 5);
    }

    @Test
    void should_reject_a_duplicate_position_when_two_photos_of_an_item_share_it() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(40)));
        photos.saveAndFlush(ArchiveFixtures.photo(ArchiveFixtures.id(41), dump, 2));

        // uk_photo_archive_item_display_order: one position holds one photo.
        assertThatThrownBy(() -> photos.saveAndFlush(ArchiveFixtures.photo(ArchiveFixtures.id(42), dump, 2)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = { -1, 6 })
    void should_reject_a_position_outside_the_dump_when_persisting(int displayOrder) {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(50)));

        // ck_photo_display_order_range: six photos, positions 0-5.
        assertThatThrownBy(
                () -> photos.saveAndFlush(ArchiveFixtures.photo(ArchiveFixtures.id(51), dump, displayOrder)))
                        .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void should_reject_a_position_without_an_item_when_persisting() {
        Photo positionedOrphan = ArchiveFixtures.photo(ArchiveFixtures.id(43), null, 3);

        // ck_photo_position_requires_item: the unique index is partial, so before V2 this row was
        // accepted — a photo claiming position 3 of nothing.
        assertThatThrownBy(() -> photos.saveAndFlush(positionedOrphan))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void should_reject_a_photo_of_a_missing_item_when_inserted_raw() {
        // fk_photo_archive_item, which had no test: no repository call writes a dangling reference
        // (the item would have to be absent from the database already), so the orphan row is written
        // with plain SQL to pin the constraint itself. ArchiveFixtures.id(9999) is never persisted.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "insert into photo (id, archive_item_id, local_file_path, display_order, category, created_at)"
                        + " values (?, ?, ?, null, 'PICS', ?)",
                ArchiveFixtures.id(44), ArchiveFixtures.id(9999), "images/orphan.jpg", utcCreatedAt()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void should_reject_an_unknown_category_when_inserted_raw() {
        // ck_photo_category: whatever writes the row, the column holds only the names
        // @Enumerated(EnumType.STRING) persists.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "insert into photo (id, archive_item_id, local_file_path, display_order, category, created_at)"
                        + " values (?, null, ?, null, 'SNAPSHOT', ?)",
                ArchiveFixtures.id(45), "images/unknown-category.jpg", utcCreatedAt()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @EnumSource(PhotoCategory.class)
    void should_round_trip_every_category_when_persisting(PhotoCategory category) {
        Photo photo = ArchiveFixtures.photo(ArchiveFixtures.id(60), null, null, category,
                ArchiveFixtures.CREATED_AT);
        photos.saveAndFlush(photo);
        entityManager.clear();

        assertThat(photos.findById(photo.getId()).orElseThrow().getCategory()).isEqualTo(category);
    }

    @Test
    void should_store_the_enum_name_when_the_wire_value_is_lowercase() {
        Photo photo = ArchiveFixtures.photo(ArchiveFixtures.id(61), null, null, PhotoCategory.UNCATEGORIZED,
                ArchiveFixtures.CREATED_AT);
        photos.saveAndFlush(photo);

        String storedCategory = jdbcTemplate.queryForObject(
                "select category from photo where id = ?", String.class, photo.getId());

        // ADR-011: the column holds the Java name, the JSON value is lowercase.
        assertThat(storedCategory).isEqualTo("UNCATEGORIZED");
        assertThat(storedCategory).isNotEqualTo(PhotoCategory.UNCATEGORIZED.wireValue());
    }

    @Test
    void should_return_the_feed_newest_first_when_two_photos_share_an_instant() {
        // The feed is the whole collection, newest first, and the id tiebreaker is what keeps it stable:
        // two uploads stamped in the same instant must still come back in one order, not in whichever
        // order the database happened to read them.
        Instant later = ArchiveFixtures.CREATED_AT.plusSeconds(60);
        photos.saveAllAndFlush(List.of(
                ArchiveFixtures.photo(ArchiveFixtures.id(70), null, null, PhotoCategory.PICS,
                        ArchiveFixtures.CREATED_AT),
                ArchiveFixtures.photo(ArchiveFixtures.id(72), null, null, PhotoCategory.PICS, later),
                ArchiveFixtures.photo(ArchiveFixtures.id(71), null, null, PhotoCategory.PICS,
                        ArchiveFixtures.CREATED_AT)));
        entityManager.clear();

        List<Photo> feed = photos.findAllByOrderByCreatedAtDescIdDesc();

        assertThat(feed).extracting(Photo::getId).containsExactly(
                ArchiveFixtures.id(72), ArchiveFixtures.id(71), ArchiveFixtures.id(70));
        assertThat(feed).extracting(Photo::getCreatedAt).containsExactly(
                later, ArchiveFixtures.CREATED_AT, ArchiveFixtures.CREATED_AT);
    }

    @Test
    void should_return_the_photos_of_several_items_in_curation_order_when_the_dump_list_is_read() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(100)));
        ArchiveItem other = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(101)));
        // Insertion order is nothing like curation order, and one photo belongs to no item at all: a
        // batch that returned rows as it found them, or every photo of the table, could not pass.
        photos.saveAllAndFlush(List.of(
                ArchiveFixtures.photo(ArchiveFixtures.id(112), dump, 2),
                ArchiveFixtures.photo(ArchiveFixtures.id(111), dump, 1),
                ArchiveFixtures.photo(ArchiveFixtures.id(121), other, 1),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(130)),
                ArchiveFixtures.photo(ArchiveFixtures.id(110), dump, 0),
                ArchiveFixtures.photo(ArchiveFixtures.id(120), other, 0)));
        entityManager.clear();

        List<Photo> batch = photos.findAllOfItemsOrderByDisplayOrder(
                List.of(dump.getId(), other.getId()));

        assertThat(idsOfItem(batch, dump)).containsExactly(ArchiveFixtures.id(110),
                ArchiveFixtures.id(111), ArchiveFixtures.id(112));
        assertThat(idsOfItem(batch, other)).containsExactly(ArchiveFixtures.id(120),
                ArchiveFixtures.id(121));
        assertThat(batch).hasSize(5);
    }

    @Test
    void should_raise_the_version_when_a_photo_is_curated() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(140)));
        // A photo's identifier is assigned by the application, not generated by the database, so `save` on
        // a fresh entity takes the merge path and hands back the managed instance — mutating the argument
        // instead would update nothing at all, which is what the first version of this test measured.
        Photo photo = photos.saveAndFlush(ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(141)));

        // @Version: an upload is inserted at 0...
        assertThat(versionOf(photo)).isZero();

        photo.attachTo(dump, 0);
        photos.flush();

        // ...and curation moves it on, which is what lets a second writer be detected instead of
        // overwriting the first (V3__photo_optimistic_locking.sql).
        assertThat(versionOf(photo)).isEqualTo(1L);
    }

    @Test
    void should_refuse_an_update_of_a_photo_that_another_writer_changed() {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(150)));
        Photo photo = photos.saveAndFlush(ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(151)));

        // The other writer curated the same photo between this writer's read and its write: the row now
        // carries version 1 while the in-memory photo still believes it is 0.
        jdbcTemplate.update("update photo set version = version + 1, display_order = 3, "
                + "archive_item_id = ? where id = ?", dump.getId(), photo.getId());

        photo.attachTo(dump, 0);

        // The update Hibernate sends carries `where id = ? and version = ?`, so it matches no row and the
        // write is refused rather than silently replacing what the other writer published.
        assertThatThrownBy(() -> photos.flush())
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test
    void should_pick_nothing_when_the_archive_is_empty() {
        // GET /photos/random answers 404 with the empty-archive code for this; the frontend shows its
        // empty state.
        assertThat(photos.findRandom()).isEmpty();
    }

    @Test
    void should_pick_the_only_photo_when_the_archive_holds_one() {
        Photo only = ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(80));
        photos.saveAndFlush(only);
        entityManager.clear();

        assertThat(photos.findRandom()).get().extracting(Photo::getId).isEqualTo(only.getId());
    }

    @Test
    void should_pick_one_of_the_photos_when_the_archive_holds_several() {
        photos.saveAllAndFlush(List.of(
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(81)),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(82))));

        // Which row `order by random()` returns is the database's business, so the test does not pin it:
        // it pins that one photo of the archive comes back, always.
        assertThat(photos.findRandom()).get().extracting(Photo::getId)
                .isIn(ArchiveFixtures.id(81), ArchiveFixtures.id(82));
    }

    /** The photos of one item, in the order the batch returned them. */
    private static List<UUID> idsOfItem(List<Photo> batch, ArchiveItem item) {
        return batch.stream()
                .filter(photo -> photo.getArchiveItem().getId().equals(item.getId()))
                .map(Photo::getId)
                .toList();
    }

    /** The stored version of a photo, read from the column Hibernate maintains. */
    private long versionOf(Photo photo) {
        return jdbcTemplate.queryForObject("select version from photo where id = ?", Long.class,
                photo.getId());
    }

    /** The fixture instant as {@code timestamptz}, for the raw inserts that bypass the entities. */
    private static OffsetDateTime utcCreatedAt() {
        return OffsetDateTime.ofInstant(ArchiveFixtures.CREATED_AT, ZoneOffset.UTC);
    }
}
