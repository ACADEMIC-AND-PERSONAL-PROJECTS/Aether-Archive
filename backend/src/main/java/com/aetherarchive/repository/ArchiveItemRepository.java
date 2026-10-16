package com.aetherarchive.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;

/**
 * Archive items: dumps and single pictures, newest first.
 */
public interface ArchiveItemRepository extends JpaRepository<ArchiveItem, UUID> {

    /**
     * The river: every item as a chronological feed. {@code id DESC} is not decoration — two items
     * can share a timestamp (created in the same tick, or imported together), and without a
     * tiebreaker the pages of that feed could repeat or skip an item between two requests.
     *
     * @return the items, newest first
     */
    List<ArchiveItem> findAllByOrderByTimestampDescIdDesc();

    /**
     * The items of one kind, newest first — the list {@code GET /api/v1/dumps} is built from
     * ({@code MONTHLY_DUMP} is the only type it asks for).
     *
     * <p>The type filter is what keeps that collection what it says it is: the table also holds the
     * single pictures and anime stills of the river (E5-S1), which are not dumps and have no six photos
     * to publish. The ordering is the river's, tiebreaker included and for the same reason — two dumps
     * published in the same microsecond must still come back in one order, or a client that re-reads the
     * list could see it reordered under its own scroll.
     *
     * @param type the kind of item to list
     * @return the items of that type, newest first
     */
    List<ArchiveItem> findAllByTypeOrderByTimestampDescIdDesc(ItemType type);
}
