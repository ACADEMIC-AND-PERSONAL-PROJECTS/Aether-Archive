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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The river query and the item half of the baseline, against a real PostgreSQL (Testcontainers,
 * ADR-009) whose schema Flyway applied.
 */
@DataJpaTest
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=repository")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestConfiguration.class)
class ArchiveItemRepositoryTest {

    @Autowired
    private ArchiveItemRepository items;

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void should_read_back_every_field_when_an_item_is_persisted() {
        ArchiveItem item = ArchiveFixtures.item(ArchiveFixtures.id(1));
        items.saveAndFlush(item);
        entityManager.clear();

        ArchiveItem reloaded = items.findById(item.getId()).orElseThrow();

        assertThat(reloaded.getType()).isEqualTo(ItemType.MONTHLY_DUMP);
        assertThat(reloaded.getTitle()).isEqualTo("Late Summer");
        assertThat(reloaded.getTimestamp()).isEqualTo(ArchiveFixtures.CREATED_AT);
        assertThat(reloaded.getBackgroundColor()).isEqualTo(ArchiveFixtures.BACKGROUND_COLOR);
    }

    @Test
    void should_accept_a_null_title_when_the_item_has_no_name() {
        ArchiveItem item = ArchiveFixtures.itemWithoutTitle(ArchiveFixtures.id(2));
        items.saveAndFlush(item);
        entityManager.clear();

        assertThat(items.findById(item.getId()).orElseThrow().getTitle()).isNull();
    }

    @Test
    void should_return_the_river_newest_first_when_timestamps_differ() {
        items.saveAllAndFlush(List.of(
                ArchiveFixtures.item(ArchiveFixtures.id(1), Instant.parse("2026-09-01T10:00:00Z")),
                ArchiveFixtures.item(ArchiveFixtures.id(2), Instant.parse("2026-10-01T10:00:00Z")),
                ArchiveFixtures.item(ArchiveFixtures.id(3), Instant.parse("2026-09-15T10:00:00Z"))));

        assertThat(ids(items.findAllByOrderByTimestampDescIdDesc())).containsExactly(
                ArchiveFixtures.id(2), ArchiveFixtures.id(3), ArchiveFixtures.id(1));
    }

    @Test
    void should_keep_the_order_stable_when_timestamps_are_equal() {
        // Without the id tiebreaker these three rows have no defined order, and a paged feed could
        // repeat one item and skip another between two requests.
        Instant sameInstant = Instant.parse("2026-10-01T10:00:00Z");
        items.saveAllAndFlush(List.of(
                ArchiveFixtures.item(ArchiveFixtures.id(2), sameInstant),
                ArchiveFixtures.item(ArchiveFixtures.id(3), sameInstant),
                ArchiveFixtures.item(ArchiveFixtures.id(1), sameInstant)));

        List<UUID> firstRead = ids(items.findAllByOrderByTimestampDescIdDesc());

        assertThat(firstRead).containsExactly(
                ArchiveFixtures.id(3), ArchiveFixtures.id(2), ArchiveFixtures.id(1));
        assertThat(ids(items.findAllByOrderByTimestampDescIdDesc())).containsExactlyElementsOf(firstRead);
    }

    @Test
    void should_list_only_the_dumps_newest_first_when_the_dump_list_is_asked() {
        Instant sameInstant = Instant.parse("2026-10-01T10:00:00Z");
        items.saveAllAndFlush(List.of(
                ArchiveFixtures.item(ArchiveFixtures.id(1), Instant.parse("2026-09-01T10:00:00Z")),
                ArchiveFixtures.itemWithoutTitle(ArchiveFixtures.id(2)),
                new ArchiveItem(ArchiveFixtures.id(3), ItemType.ANIME, "Still",
                        Instant.parse("2026-10-20T10:00:00Z"), ArchiveFixtures.BACKGROUND_COLOR),
                ArchiveFixtures.item(ArchiveFixtures.id(4), sameInstant),
                ArchiveFixtures.item(ArchiveFixtures.id(5), sameInstant)));

        // GET /api/v1/dumps is a list of dumps, not of archive items: a single picture and an anime still
        // are items too, and neither is a six-photo compilation. Newest first, with the id tiebreaker the
        // river uses for the rows that share an instant.
        assertThat(ids(items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP)))
                .containsExactly(ArchiveFixtures.id(5), ArchiveFixtures.id(4), ArchiveFixtures.id(1));
    }

    @ParameterizedTest
    @EnumSource(ItemType.class)
    void should_round_trip_every_type_when_persisting(ItemType type) {
        ArchiveItem item = new ArchiveItem(ArchiveFixtures.id(4), type, null, ArchiveFixtures.CREATED_AT,
                ArchiveFixtures.BACKGROUND_COLOR);
        items.saveAndFlush(item);
        entityManager.clear();

        assertThat(items.findById(item.getId()).orElseThrow().getType()).isEqualTo(type);
    }

    @ParameterizedTest
    @ValueSource(strings = { "red", "#abc", "#1234567", "#GGGGGG" })
    void should_reject_a_colour_outside_rrggbb_when_persisting(String colour) {
        ArchiveItem item = new ArchiveItem(ArchiveFixtures.id(5), ItemType.ANIME, null,
                ArchiveFixtures.CREATED_AT, colour);

        // The service validates on the way in; the database also refuses to store anything else,
        // whatever writes it: ck_archive_item_background_color rejects a value that is not #RRGGBB,
        // and varchar(7) rejects one that is merely too long.
        assertThatThrownBy(() -> items.saveAndFlush(item)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void should_reject_an_unknown_type_when_inserted_raw() {
        // ck_archive_item_type: whatever writes the row, the column holds only the constants of
        // ItemType.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "insert into archive_item (id, type, title, \"timestamp\", background_color)"
                        + " values (?, 'VIDEO', null, ?, '#1B2A41')",
                ArchiveFixtures.id(6), OffsetDateTime.ofInstant(ArchiveFixtures.CREATED_AT, ZoneOffset.UTC)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private static List<UUID> ids(List<ArchiveItem> items) {
        return items.stream().map(ArchiveItem::getId).toList();
    }
}
