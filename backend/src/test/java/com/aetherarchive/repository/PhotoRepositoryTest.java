package com.aetherarchive.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

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
import org.springframework.test.context.ActiveProfiles;

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
}
