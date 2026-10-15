package com.aetherarchive.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aetherarchive.domain.ArchiveItem;

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
}
