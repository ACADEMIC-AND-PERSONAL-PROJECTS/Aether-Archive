package com.aetherarchive.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.dto.DumpCreateRequest;
import com.aetherarchive.dto.DumpResponse;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.exception.DumpValidationException;
import com.aetherarchive.exception.FieldViolation;
import com.aetherarchive.repository.ArchiveItemRepository;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.support.ArchiveFixtures;

/**
 * Unit tests of the dump service: the rules a publish is refused by, and the order the six photos are
 * given when it is accepted.
 *
 * <p>Both repositories are mocks — these are the service's rules, and the queries it relies on are pinned
 * against a real PostgreSQL in {@code DumpQueryTest}. The clock is fixed, because the instant a dump is
 * stamped with is part of the body the tests name.
 */
class DumpServiceTest {

    /** The instant {@link DumpServiceTest}'s clock is fixed at, with non-zero sub-second digits. */
    private static final Instant PUBLISHED_AT = Instant.parse("2026-10-16T09:30:45.123456Z");

    private static final String TITLE = "Septembre";

    private static final String BACKGROUND_COLOR = "#1A1A1A";

    private ArchiveItemRepository items;

    private PhotoRepository photos;

    private DumpService service;

    @BeforeEach
    void setUp() {
        items = mock(ArchiveItemRepository.class);
        photos = mock(PhotoRepository.class);
        service = new DumpService(items, photos, Clock.fixed(PUBLISHED_AT, ZoneOffset.UTC));
    }

    @Test
    void should_publish_the_six_photos_in_the_order_the_request_named_them() {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        // An obviously shuffled request, so nothing here can pass by accident on a sorted list — and the
        // repository answers in yet another order, which is what a database is free to do.
        List<UUID> curationOrder = List.of(ids.get(3), ids.get(0), ids.get(5), ids.get(1), ids.get(4), ids.get(2));
        List<Photo> uploads = ArchiveFixtures.unassignedDumpPhotos();
        given(photos.findAllById(any())).willReturn(uploads.reversed());
        given(items.saveAndFlush(any(ArchiveItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        DumpResponse published = service.create(new DumpCreateRequest(TITLE, BACKGROUND_COLOR, curationOrder));

        // The order of the published array is the order of the request, and every photo carries the
        // position it was given there.
        assertThat(published.photos()).extracting(PhotoResponse::id).containsExactlyElementsOf(curationOrder);
        for (UUID id : curationOrder) {
            Photo photo = photoOf(uploads, id);
            assertThat(photo.getDisplayOrder()).isEqualTo(curationOrder.indexOf(id));
            assertThat(photo.getArchiveItem().getId()).isEqualTo(published.id());
        }

        // And the item the six of them now belong to: a monthly dump, named and coloured by the request,
        // stamped by the archive's clock.
        ArgumentCaptor<ArchiveItem> saved = ArgumentCaptor.forClass(ArchiveItem.class);
        then(items).should().saveAndFlush(saved.capture());
        ArchiveItem dump = saved.getValue();
        assertThat(dump.getId()).isEqualTo(published.id());
        assertThat(dump.getType()).isEqualTo(ItemType.MONTHLY_DUMP);
        assertThat(dump.getTitle()).isEqualTo(TITLE);
        assertThat(dump.getBackgroundColor()).isEqualTo(BACKGROUND_COLOR);
        assertThat(dump.getTimestamp()).isEqualTo(PUBLISHED_AT);
    }

    @Test
    void should_stamp_the_dump_with_the_precision_the_database_keeps() {
        DumpService serviceWithNanoseconds = new DumpService(items, photos,
                Clock.fixed(Instant.parse("2026-10-16T09:30:45.123456789Z"), ZoneOffset.UTC));
        given(photos.findAllById(any())).willReturn(ArchiveFixtures.unassignedDumpPhotos());
        given(items.saveAndFlush(any(ArchiveItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        DumpResponse published = serviceWithNanoseconds.create(publishRequest());

        // `timestamptz` keeps microseconds: stamping the JVM clock's finer digits would leave the 201 and
        // every later read of the same dump disagreeing about when it was published.
        assertThat(published.createdAt()).isEqualTo(PUBLISHED_AT);
    }

    @Test
    void should_publish_a_dump_without_a_title_when_the_request_has_none() {
        given(photos.findAllById(any())).willReturn(ArchiveFixtures.unassignedDumpPhotos());
        given(items.saveAndFlush(any(ArchiveItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        // ADR-011: the contract lists the title as required, and the archive accepts a body without one.
        DumpResponse published = service.create(
                new DumpCreateRequest(null, BACKGROUND_COLOR, ArchiveFixtures.dumpPhotoIds()));

        assertThat(published.title()).isNull();
        assertThat(published.photos()).hasSize(ArchiveFixtures.dumpPhotoIds().size());
    }

    @Test
    void should_refuse_a_photo_named_twice_before_reading_or_writing_anything() {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        List<UUID> twice = List.of(ids.get(0), ids.get(1), ids.get(2), ids.get(3), ids.get(4), ids.get(0));

        DumpValidationException refusal = catchThrowableOfType(DumpValidationException.class,
                () -> service.create(new DumpCreateRequest(TITLE, BACKGROUND_COLOR, twice)));

        assertThat(fieldViolationsOf(refusal)).containsExactly("photoIds");
        assertThat(refusal.violations().getFirst().message())
                .contains("six different photos")
                .contains(ids.get(0).toString());
        // Nothing was read and nothing was written: a refused publish cannot leave half of something.
        then(items).shouldHaveNoInteractions();
        then(photos).shouldHaveNoInteractions();
    }

    @Test
    void should_name_the_id_that_is_not_in_the_archive_when_a_photo_cannot_be_found() {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        List<Photo> known = ArchiveFixtures.unassignedDumpPhotos();
        given(photos.findAllById(any())).willReturn(known.subList(1, known.size()));

        DumpValidationException refusal = catchThrowableOfType(DumpValidationException.class,
                () -> service.create(new DumpCreateRequest(TITLE, BACKGROUND_COLOR, ids)));

        // The client sent six ids and cannot look them up: the refusal has to say which one is unknown.
        assertThat(refusal.violations()).hasSize(1);
        assertThat(refusal.violations().getFirst().field()).isEqualTo("photoIds");
        assertThat(refusal.violations().getFirst().message())
                .contains("not in the archive")
                .contains(ids.getFirst().toString());
        // The item is only created once all six are known to be publishable.
        then(items).shouldHaveNoInteractions();
    }

    @Test
    void should_refuse_a_photo_that_already_belongs_to_another_item_when_it_is_curated() {
        ArchiveItem other = ArchiveFixtures.item(ArchiveFixtures.id(99));
        List<Photo> uploads = ArchiveFixtures.unassignedDumpPhotos();
        Photo curated = ArchiveFixtures.photo(ArchiveFixtures.id(1), other, 2);
        List<Photo> mixed = List.of(curated, uploads.get(1), uploads.get(2), uploads.get(3), uploads.get(4),
                uploads.get(5));
        given(photos.findAllById(any())).willReturn(mixed);

        DumpValidationException refusal = catchThrowableOfType(DumpValidationException.class,
                () -> service.create(new DumpCreateRequest(TITLE, BACKGROUND_COLOR,
                        ArchiveFixtures.dumpPhotoIds())));

        // A photo belongs to at most one item: a second publish of it is refused, never a silent move
        // that would empty the dump it came from.
        assertThat(refusal.violations()).hasSize(1);
        assertThat(refusal.violations().getFirst().message())
                .contains("already belongs to another item")
                .contains(curated.getId().toString());
        assertThat(curated.getArchiveItem().getId()).isEqualTo(other.getId());
        assertThat(curated.getDisplayOrder()).isEqualTo(2);
        then(items).shouldHaveNoInteractions();
    }

    @Test
    void should_report_every_photo_it_cannot_publish_at_once() {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        given(photos.findAllById(any())).willReturn(List.of()); // none of the six is in the archive

        DumpValidationException refusal = catchThrowableOfType(DumpValidationException.class,
                () -> service.create(new DumpCreateRequest(TITLE, BACKGROUND_COLOR, ids)));

        // Six ids are wrong: the client reads six entries and fixes them in one round trip.
        assertThat(fieldViolationsOf(refusal)).hasSize(ids.size());
        assertThat(refusal.violations()).allSatisfy(violation -> assertThat(violation.field())
                .isEqualTo("photoIds"));
    }

    @Test
    void should_publish_the_dumps_newest_first_with_their_photos_in_order_when_the_list_is_asked() {
        ArchiveItem newest = ArchiveFixtures.item(ArchiveFixtures.id(11),
                Instant.parse("2026-10-16T10:00:00Z"));
        ArchiveItem oldest = ArchiveFixtures.item(ArchiveFixtures.id(12),
                Instant.parse("2026-09-16T10:00:00Z"));
        Photo firstOfNewest = ArchiveFixtures.photo(ArchiveFixtures.id(21), newest, 0);
        Photo secondOfNewest = ArchiveFixtures.photo(ArchiveFixtures.id(22), newest, 1);
        Photo firstOfOldest = ArchiveFixtures.photo(ArchiveFixtures.id(23), oldest, 0);
        Photo secondOfOldest = ArchiveFixtures.photo(ArchiveFixtures.id(24), oldest, 1);
        given(items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP))
                .willReturn(List.of(newest, oldest));
        given(photos.findAllOfItemsOrderByDisplayOrder(any())).willReturn(List.of(
                firstOfNewest, secondOfNewest, firstOfOldest, secondOfOldest));

        List<DumpResponse> dumps = service.findAll();

        assertThat(dumps).extracting(DumpResponse::id).containsExactly(newest.getId(), oldest.getId());
        assertThat(dumps.get(0).photos()).extracting(PhotoResponse::id)
                .containsExactly(firstOfNewest.getId(), secondOfNewest.getId());
        assertThat(dumps.get(1).photos()).extracting(PhotoResponse::id)
                .containsExactly(firstOfOldest.getId(), secondOfOldest.getId());
        // One batch for both dumps, asking for the items the list returned and no others.
        then(photos).should().findAllOfItemsOrderByDisplayOrder(List.of(newest.getId(), oldest.getId()));
    }

    @Test
    void should_not_read_photos_when_the_archive_holds_no_dump() {
        given(items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP)).willReturn(List.of());

        assertThat(service.findAll()).isEmpty();
        then(photos).shouldHaveNoInteractions();
    }

    private static DumpCreateRequest publishRequest() {
        return new DumpCreateRequest(TITLE, BACKGROUND_COLOR, ArchiveFixtures.dumpPhotoIds());
    }

    private static Photo photoOf(List<Photo> photos, UUID id) {
        return photos.stream().filter(photo -> photo.getId().equals(id)).findFirst().orElseThrow();
    }

    private static List<String> fieldViolationsOf(DumpValidationException refusal) {
        assertThat(refusal).isNotNull();
        return refusal.violations().stream().map(FieldViolation::field).toList();
    }
}
