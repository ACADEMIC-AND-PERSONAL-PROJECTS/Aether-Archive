package com.aetherarchive.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.dto.DumpCreateRequest;
import com.aetherarchive.dto.DumpResponse;
import com.aetherarchive.exception.DumpValidationException;
import com.aetherarchive.exception.FieldViolation;
import com.aetherarchive.repository.ArchiveItemRepository;
import com.aetherarchive.repository.PhotoRepository;

/**
 * The dump API's behaviour: publishing six photos as a monthly dump, and reading the published ones back.
 *
 * <p><strong>What publishing is.</strong> The six photos already exist — they are uploads, unassigned
 * since the day they were stored (ADR-011) — and the request names them in the order the dump displays
 * them. A publish therefore creates one {@link ArchiveItem} of type {@link ItemType#MONTHLY_DUMP} and
 * attaches the six photos to it, positions {@code 0..5} in the order the identifiers arrived in. The
 * request never carries a position, and the response never publishes one: the position <em>is</em> the
 * index in the published array.
 *
 * <p><strong>The rules bean validation cannot state live here</strong>, because they compare the request
 * with itself and with the archive: the six identifiers must be different, each must name a photo that
 * exists, and none may already be curated into another item — a photo belongs to at most one item
 * ({@code docs/engineering/ARCHITECTURE.md} §3), so a second publish of it is refused rather than quietly
 * moving it, which would empty the dump it came from. Every one of those refusals is a 400 naming
 * {@code photoIds} with a sentence about the id that is wrong, the same shape a rejected body gets, since
 * the client's only repair is to send a different body.
 *
 * <p>The item and its six photos are written in one transaction: a dump that reached the database without
 * its photos would be a six-photo compilation with none, and a photo attached to an item that was never
 * committed would be invisible to every later read.
 */
@Service
public class DumpService {

    /** The field of {@code DumpCreate} every photo problem is reported against. */
    private static final String FIELD_PHOTO_IDS = "photoIds";

    private static final Logger log = LoggerFactory.getLogger(DumpService.class);

    private final ArchiveItemRepository items;
    private final PhotoRepository photos;
    private final Clock clock;

    public DumpService(ArchiveItemRepository items, PhotoRepository photos, Clock clock) {
        this.items = items;
        this.photos = photos;
        this.clock = clock;
    }

    /**
     * Publishes a dump from the six photos the request names, in the order the request names them.
     *
     * <p>Nothing is written before the whole request is known to be publishable: the checks read the
     * request and the archive, and the item is created only once they have passed. A request that names
     * the same photo twice fails before the first statement, so a refused publish cannot attach half of
     * something.
     *
     * @param request the body of the contract's {@code DumpCreate}
     * @return the created dump, its photos in the order the request asked for
     * @throws DumpValidationException when the six identifiers are not six different photos of the archive
     *     that are still uncurated; every problem found is reported, not only the first
     */
    @Transactional
    public DumpResponse create(DumpCreateRequest request) {
        List<UUID> photoIds = request.photoIds();
        requireDistinct(photoIds);
        Map<UUID, Photo> curatable = resolveCuratable(photoIds);

        ArchiveItem dump = new ArchiveItem(UUID.randomUUID(), ItemType.MONTHLY_DUMP, request.title(),
                publishedAt(), request.backgroundColor());
        // The item is inserted before the photos are attached to it, and the flush is what makes that an
        // order rather than a hope: the six updates carry a foreign key to this row, so the row has to be
        // in the database by the time they are written, whatever order the persistence context drains its
        // action queue in.
        items.saveAndFlush(dump);

        List<Photo> ordered = attach(dump, photoIds, curatable);
        log.info("Published dump {} with {} photos", dump.getId(), ordered.size());
        return DumpResponse.from(dump, ordered);
    }

    /**
     * The dumps of the archive, newest first, each with its photos in curation order.
     *
     * <p>Two statements, never one per dump: the items first, then every photo of all of them in a single
     * batch, grouped in memory by the item each row belongs to. The second statement is skipped entirely
     * when the archive holds no dump, and the batch fetches each photo's item with it, so grouping costs
     * no further query. {@code DumpQueryTest} pins that statement count against a real PostgreSQL.
     *
     * @return the dumps as the contract describes them, newest first
     */
    @Transactional(readOnly = true)
    public List<DumpResponse> findAll() {
        List<ArchiveItem> dumps = items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP);
        if (dumps.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<Photo>> byItem = groupByItem(
                photos.findAllOfItemsOrderByDisplayOrder(identifierOfEach(dumps)));
        return dumps.stream()
                .map(dump -> DumpResponse.from(dump, byItem.getOrDefault(dump.getId(), List.of())))
                .toList();
    }

    /**
     * Attaches the six photos to the item, in the order the request named them.
     *
     * <p>The loop's index is the position, which is the whole of the rule "the order of the ids is the
     * display order" — and the reason the photos are looked up by identifier instead of being taken in
     * the order the database returned them: {@code findAllById} makes no promise about the order of its
     * result, and the request's order is the one that matters.
     */
    private static List<Photo> attach(ArchiveItem dump, List<UUID> photoIds, Map<UUID, Photo> byId) {
        List<Photo> ordered = new ArrayList<>(photoIds.size());
        for (int displayOrder = 0; displayOrder < photoIds.size(); displayOrder++) {
            Photo photo = byId.get(photoIds.get(displayOrder));
            photo.attachTo(dump, displayOrder);
            ordered.add(photo);
        }
        return ordered;
    }

    /**
     * Refuses a request that names the same photo twice, before anything is read or written.
     *
     * <p>A dump holds six <em>different</em> photos, and this is the one rule that can be decided from the
     * request alone: doing it first also keeps the two checks below sound, because they visit each
     * identifier once and can therefore speak about "the photo this id names" without wondering which of
     * several occurrences they are looking at.
     */
    private static void requireDistinct(List<UUID> photoIds) {
        Set<UUID> seen = new HashSet<>();
        List<FieldViolation> violations = new ArrayList<>();
        for (UUID id : photoIds) {
            if (!seen.add(id)) {
                violations.add(new FieldViolation(FIELD_PHOTO_IDS,
                        "must name six different photos; " + id + " is named more than once"));
            }
        }
        if (!violations.isEmpty()) {
            throw new DumpValidationException(violations);
        }
    }

    /**
     * The six photos the request names, keyed by identifier — or the refusal listing what is wrong with
     * them: an id no photo holds, an id whose photo already belongs to another item.
     *
     * <p>Every problem is collected rather than the first one thrown, so a client that got two of its six
     * ids wrong reads both in one response instead of discovering the second after fixing the first. The
     * message names the identifier, which is the one thing the client cannot look up itself: it sent six
     * ids and has to be told which of them the archive could not match.
     *
     * <p>The check for an item reads the foreign key through the lazy association, which loads nothing:
     * a photo that is already curated does not have to be read for its dump's sake to be refused.
     */
    private Map<UUID, Photo> resolveCuratable(List<UUID> photoIds) {
        Map<UUID, Photo> byId = photos.findAllById(photoIds).stream()
                .collect(Collectors.toMap(Photo::getId, Function.identity()));
        List<FieldViolation> violations = new ArrayList<>();
        for (UUID id : photoIds) {
            Photo photo = byId.get(id);
            if (photo == null) {
                violations.add(new FieldViolation(FIELD_PHOTO_IDS,
                        "names a photo that is not in the archive: " + id));
            }
            else if (photo.getArchiveItem() != null) {
                violations.add(new FieldViolation(FIELD_PHOTO_IDS,
                        "names a photo that already belongs to another item: " + id));
            }
        }
        if (!violations.isEmpty()) {
            throw new DumpValidationException(violations);
        }
        return byId;
    }

    /** The photos of the list, grouped by the item they belong to, each group keeping the query's order. */
    private static Map<UUID, List<Photo>> groupByItem(List<Photo> photos) {
        return photos.stream().collect(Collectors.groupingBy(photo -> photo.getArchiveItem().getId(),
                LinkedHashMap::new, Collectors.toList()));
    }

    private static List<UUID> identifierOfEach(List<ArchiveItem> items) {
        return items.stream().map(ArchiveItem::getId).toList();
    }

    /**
     * The instant this dump is stamped with, at the precision the archive can keep.
     *
     * <p>{@code timestamptz} stores microseconds, so a stamp with the finer digits a JVM clock reports
     * would come back from the database rounded — and the 201 that created a dump would then name an
     * instant no later read of that dump ever shows. The API publishes the row's instant, so it stamps the
     * value the row will hold, exactly as an upload does.
     */
    private Instant publishedAt() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
