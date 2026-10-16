package com.aetherarchive.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import jakarta.persistence.EntityManagerFactory;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.dto.DumpResponse;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.service.DumpService;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The read path of {@code GET /api/v1/dumps} against a real PostgreSQL: the item list, the batch that
 * brings the photos of all of those items at once, and how many statements the two of them really cost.
 *
 * <p>This is the one thing a mocked repository cannot say anything about. {@code DumpServiceTest} proves
 * the service groups and publishes what it is handed, but "the photos of ten dumps are read in one query
 * rather than ten" is a claim about SQL: a lazy association reached while grouping, or a loop that called
 * the per-item query, would pass every unit test and still make the endpoint quadratic. The counters
 * below are the measurement — a batch that quietly became an N+1 shows up here as a number, not as a
 * slower page nobody notices until the archive has a few hundred dumps.
 *
 * <p>The service is built by hand instead of imported: a {@code @DataJpaTest} does not scan
 * {@code @Service} beans, and importing one would change this class's context configuration — every
 * {@code @DataJpaTest} of the suite shares a single context and a single database, and only because
 * their annotations are identical. Hand-built, the service is also unproxied: no transaction wraps these
 * two queries, so what this class measures is the statements they issue and nothing more. The endpoint's
 * real transaction boundary is exercised by {@code DumpApiFlowTest}, and what a rollback of it leaves
 * behind by {@code DumpPublishAtomicityTest}.
 *
 * <p>The database is named because these tests read the <em>whole</em> archive: the assertion below is
 * that the list holds exactly the two dumps it published, and {@code PhotoRepositoryTest} counts every
 * photo there is. A database another context commits into would make both of them describe that context's
 * data instead. The name is the same in all four repository slices, so the four keep sharing one context
 * and one schema; a class added to this family that reads no row it did not write belongs in {@code test}
 * instead.
 */
@DataJpaTest
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=repository")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestConfiguration.class)
class DumpQueryTest {

    /**
     * The order the six photos of a dump are inserted in: positions 3, 0, 5, 2, 1, 4. Nothing like the
     * order they are displayed in, so a query that forgot its {@code ORDER BY display_order} — or a
     * repository method that returned rows in insertion order — could not pass this class by accident.
     */
    private static final List<Integer> INSERTION_ORDER = List.of(3, 0, 5, 2, 1, 4);

    private static final Instant SEPTEMBER = Instant.parse("2026-09-16T10:00:00Z");

    private static final Instant OCTOBER = Instant.parse("2026-10-16T10:00:00Z");

    @Autowired
    private ArchiveItemRepository items;

    @Autowired
    private PhotoRepository photos;

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private DumpService service;

    @BeforeEach
    void setUp() {
        service = new DumpService(items, photos, Clock.fixed(ArchiveFixtures.CREATED_AT, ZoneOffset.UTC));
    }

    @Test
    void should_read_the_whole_dump_list_in_two_statements_when_several_dumps_are_published() {
        ArchiveItem september = publish(1, 10, SEPTEMBER);
        ArchiveItem october = publish(2, 20, OCTOBER);
        entityManager.flush();
        entityManager.clear();
        Statistics statistics = statistics();
        statistics.clear();

        List<DumpResponse> dumps = service.findAll();

        // Newest first, and each dump with its own six photos in curation order — the positions the rows
        // were inserted with are scrambled, so this order can only come from the queries.
        assertThat(dumps).extracting(DumpResponse::id).containsExactly(october.getId(), september.getId());
        assertThat(dumps.get(0).photos()).extracting(PhotoResponse::id).containsExactlyElementsOf(photoIds(20));
        assertThat(dumps.get(1).photos()).extracting(PhotoResponse::id).containsExactlyElementsOf(photoIds(10));

        // One statement for the items and one for the photos of both of them — a per-dump query in place of
        // the batch would push this to three, which is what the batch is here to prevent. The fetch join of
        // the photo query is not what holds this number today: the grouping asks a photo for its item's
        // identifier alone, which the proxy answers from the foreign key it already carries, without a
        // statement. It is insurance for a grouping that reads anything more of the item, which would
        // otherwise cost one query per photo.
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        assertThat(statistics.getQueryExecutionCount()).isEqualTo(2);
    }

    @Test
    void should_list_only_the_dumps_when_the_archive_holds_other_kinds_of_items() {
        ArchiveItem dump = publish(3, 30, SEPTEMBER);
        // A single picture is an archive item too, and it is not a six-photo compilation: the river will
        // publish plenty of those (E5-S1), and none of them belongs in GET /dumps.
        items.saveAndFlush(ArchiveFixtures.itemWithoutTitle(ArchiveFixtures.id(90)));
        ArchiveItem anime = new ArchiveItem(ArchiveFixtures.id(91), ItemType.ANIME, "Still",
                OCTOBER, ArchiveFixtures.BACKGROUND_COLOR);
        items.saveAndFlush(anime);
        entityManager.flush();
        entityManager.clear();

        List<DumpResponse> dumps = service.findAll();

        assertThat(dumps).extracting(DumpResponse::id).containsExactly(dump.getId());
    }

    @Test
    void should_read_nothing_but_the_items_when_the_archive_holds_no_dump() {
        Statistics statistics = statistics();
        statistics.clear();

        assertThat(service.findAll()).isEmpty();

        // No dumps, so no photos are asked for: the batch is skipped rather than run over an empty list.
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    /**
     * Publishes a dump of six photos through the repositories, the way the service does: readable
     * identifiers, and the positions of {@link #INSERTION_ORDER} — the photo of position 3 is inserted
     * first and the one of position 4 last.
     */
    private ArchiveItem publish(long itemId, long firstPhotoId, Instant timestamp) {
        ArchiveItem dump = items.saveAndFlush(ArchiveFixtures.item(ArchiveFixtures.id(itemId), timestamp));
        photos.saveAllAndFlush(INSERTION_ORDER.stream()
                .map(position -> ArchiveFixtures.photo(ArchiveFixtures.id(firstPhotoId + position), dump,
                        position))
                .toList());
        return dump;
    }

    /** The six identifiers of one dump, in curation order: {@code firstPhotoId} … {@code firstPhotoId+5}. */
    private static List<UUID> photoIds(long firstPhotoId) {
        return IntStream.range(0, ValidationConstraints.DUMP_PHOTO_COUNT)
                .mapToObj(position -> ArchiveFixtures.id(firstPhotoId + position))
                .toList();
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }
}
