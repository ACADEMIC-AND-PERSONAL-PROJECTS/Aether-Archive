package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Clock;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.aetherarchive.domain.Photo;
import com.aetherarchive.dto.DumpCreateRequest;
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.repository.ArchiveItemRepository;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.service.DumpService;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * What a publish leaves behind when the database refuses one of its photos: nothing.
 *
 * <p>{@code create} writes two things — the item, then the six positions on the photos that belong to it —
 * and the archive must never hold the first without the second. A dump with no photos is a six-photo
 * compilation with nothing in it, and the item's own row would be the only trace of a publish whose
 * response was a failure. The reason this class exists is not that the guarantee is doubted today: it is
 * that the guarantee is easy to lose. The obvious next change to {@code create} is one that catches a
 * concurrency failure to answer 409 — and if that catch were placed around the photo updates, the item's
 * insert would be committed on its own and the dump would survive without its pictures, silently. This
 * test would fail on the first run of such a change; no mocked repository could, because a mock cannot
 * roll a transaction back.
 *
 * <p>The refusal is real: the class adds a test-only Flyway folder whose single migration makes curation
 * impossible ({@code archive_item_id is null} for every photo), so the six updates are rejected by
 * PostgreSQL exactly as a violated check would reject them in production. The migration lives in
 * {@code src/test/resources/db/test-migration-curation} and on no classpath the application runs from.
 *
 * <p>The test holds no transaction of its own ({@link Propagation#NOT_SUPPORTED}): a test-managed
 * transaction would hide the very thing under test, because the item would be rolled back by the test
 * framework rather than by the failed publish. Every write is therefore committed or rolled back for real,
 * and the assertions read the database afterwards.
 */
@DataJpaTest
@ActiveProfiles("test")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(
        properties = "spring.flyway.locations=classpath:db/migration,classpath:db/test-migration-curation")
@Import({ PostgresTestConfiguration.class, DumpService.class,
        DumpPublishAtomicityTest.FixedClockConfiguration.class })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DumpPublishAtomicityTest {

    @Autowired
    private DumpService service;

    @Autowired
    private ArchiveItemRepository items;

    @Autowired
    private PhotoRepository photos;

    @Test
    void should_leave_no_dump_behind_when_the_database_refuses_a_photo_of_it() {
        List<Photo> uploads = photos.saveAllAndFlush(ArchiveFixtures.unassignedDumpPhotos());

        assertThat(uploads).hasSize(ValidationConstraints.DUMP_PHOTO_COUNT);
        assertThatExceptionOfType(DataAccessException.class).isThrownBy(() -> service.create(
                new DumpCreateRequest(null, ArchiveFixtures.BACKGROUND_COLOR,
                        ArchiveFixtures.dumpPhotoIds())));

        // The item was inserted and flushed before the photos were attached — the flush is what makes its
        // row exist while the updates are still to come — and the transaction that wrote it is the same
        // transaction that failed, so there is no dump left to find.
        assertThat(items.count()).isZero();
        // And no photo is curated: the six uploads are still uploads, with no item and no position, so the
        // archive holds them exactly as it did before the refused publish.
        assertThat(photos.findAllById(ArchiveFixtures.dumpPhotoIds())).hasSize(uploads.size())
                .allSatisfy(photo -> {
                    assertThat(photo.getArchiveItem()).isNull();
                    assertThat(photo.getDisplayOrder()).isNull();
                });
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {

        /** The stamp a publish takes: fixed, so nothing asserted here depends on when it ran. */
        @Bean
        Clock clock() {
            return Clock.fixed(ArchiveFixtures.CREATED_AT, ZoneOffset.UTC);
        }
    }
}
