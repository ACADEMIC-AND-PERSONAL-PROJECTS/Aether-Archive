package com.aetherarchive.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aetherarchive.domain.Photo;

/**
 * Photos, assigned to an item or still waiting for curation.
 */
public interface PhotoRepository extends JpaRepository<Photo, UUID> {

    /**
     * The photos of one item in curation order — the position they are shown and published in
     * (ADR-011: the contract's response is an ordered array, the ordering itself is stored here).
     *
     * @param archiveItemId identifier of the item
     * @return its photos, ordered by {@code displayOrder}, ascending
     */
    List<Photo> findAllByArchiveItemIdOrderByDisplayOrderAsc(UUID archiveItemId);
}
