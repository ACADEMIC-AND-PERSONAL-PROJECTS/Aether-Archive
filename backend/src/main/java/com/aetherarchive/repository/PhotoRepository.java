package com.aetherarchive.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

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

    /**
     * Every photo, newest first: the order of {@code GET /api/v1/photos}, the "Fleuve Temporel" the
     * contract describes as {@code timestamp} descending.
     *
     * <p>The ordering is the database's rather than a sort in Java, so the feed arrives in one query and
     * the response cannot disagree with what the index would serve. {@code id} breaks a tie: the column
     * stores microseconds and nothing stops two rows from sharing one, and a feed that reordered itself
     * between two identical requests would make the frontend's scroll jump.
     *
     * @return all photos, {@code createdAt} descending, {@code id} descending
     */
    List<Photo> findAllByOrderByCreatedAtDescIdDesc();

    /**
     * One photo, chosen uniformly at random — the "Accueil Dopamine" of the contract.
     *
     * <p>Native because the randomness is the database's ({@code random()}); the contract fixes no order
     * for this endpoint — the feed's ordering is the one ADR-011 writes down — so sampling the table is
     * all it takes. There is no parameter and no concatenation: the statement is a constant, a full sort
     * of a table that holds one person's photos (thousands of rows at most, over a whole archive's life)
     * is cheap enough that {@code TABLESAMPLE} would buy nothing, and reading one row per request keeps
     * the choice uniform without keeping a deck of ids in memory.
     *
     * @return a photo, or empty when the archive holds none
     */
    @Query(value = "select * from photo order by random() limit 1", nativeQuery = true)
    Optional<Photo> findRandom();
}
