package com.aetherarchive.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.domain.Photo;
import com.aetherarchive.domain.PhotoCategory;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.exception.EmptyArchiveException;
import com.aetherarchive.repository.PhotoRepository;

/**
 * The photo API's behaviour: an upload becomes a stored image and a row, the feed is the rows newest
 * first, and the splash gets one of them at random.
 *
 * <p><strong>What an upload is.</strong> The bytes go through {@link StorageService}, which is the only
 * thing in the archive that touches the data directory, and the row is created from what it reports: the
 * photo keeps the identifier of its stored file, so the row and the file name cannot disagree. Both
 * curation columns are left null — an upload is <em>unassigned</em> until a dump is published (ADR-011) —
 * and the category is the one the request named, converted by the web layer.
 *
 * <p><strong>An upload that fails leaves nothing behind.</strong> The file is written first and the row
 * second, and the order is deliberate: the row is what the API hands out, so it must never describe an
 * image that is not on disk — a client that could see such a row would get a photo entry whose
 * {@code url} answers 404, and nothing in the archive would be able to repair it. The reverse cannot
 * happen: if the insert is refused (the baseline's checks, a full disk on the database's side, a
 * connection that dropped), the stored file is the only trace, and the compensation below removes it
 * before the failure travels on. A crash between the two steps leaves exactly that trace too, which is a
 * file the operator can find — an orphan image, not a lie told to the API.
 *
 * <p>The service is not transactional, and that is again on purpose: the insert has to be known to have
 * succeeded <em>before</em> this method returns, because the compensation runs in its failure path.
 * Handing the row to a transaction that commits after the method has returned would move the failure
 * outside the code that cleans up after it. {@code saveAndFlush} commits the insert here, either way.
 */
@Service
public class PhotoService {

    private static final Logger log = LoggerFactory.getLogger(PhotoService.class);

    private final StorageService storage;
    private final PhotoRepository photos;
    private final Clock clock;

    public PhotoService(StorageService storage, PhotoRepository photos, Clock clock) {
        this.storage = storage;
        this.photos = photos;
        this.clock = clock;
    }

    /**
     * Stores an upload and records it, unassigned.
     *
     * @param file the multipart upload; validated and named by {@link StorageService}
     * @param category the category the request named, already converted to the domain enum
     * @return the created photo, as the contract describes it
     * @throws com.aetherarchive.exception.UnsupportedImageTypeException when the upload is not an accepted
     *     image
     * @throws com.aetherarchive.exception.UploadTooLargeException when it is over the configured limit
     * @throws com.aetherarchive.exception.StorageException when it cannot be written
     */
    public PhotoResponse upload(MultipartFile file, PhotoCategory category) {
        StoredFile stored = storage.store(file);
        Photo photo = new Photo(stored.id(), null, stored.relativePath(), null, category, uploadedAt());
        try {
            photos.saveAndFlush(photo);
        }
        catch (RuntimeException failure) {
            discard(stored);
            throw failure;
        }
        log.info("Archived photo {} as {}", photo.getId(), category.wireValue());
        return PhotoResponse.from(photo);
    }

    /**
     * The instant this upload is stamped with, at the precision the archive can keep.
     *
     * <p>{@code timestamptz} stores microseconds, so a stamp with the finer digits a JVM clock reports
     * would come back from the database rounded — and the same photo would then carry one
     * {@code uploadedAt} in the 201 that created it and a different one in every feed that lists it. The
     * API publishes the row's instant (ADR-011), so it stamps the value the row will hold.
     */
    private Instant uploadedAt() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    /**
     * The feed: every photo, newest first — the {@code "Fleuve Temporel"} of the contract.
     *
     * @return the photos as the contract describes them, ordered by the repository
     */
    public List<PhotoResponse> findAll() {
        return photos.findAllByOrderByCreatedAtDescIdDesc().stream().map(PhotoResponse::from).toList();
    }

    /**
     * One photo of the archive, chosen uniformly at random.
     *
     * @return the photo the database picked
     * @throws EmptyArchiveException when the archive holds no photo yet; the client shows an empty screen
     *     for it, never a crash
     */
    public PhotoResponse findRandom() {
        return photos.findRandom()
                .map(PhotoResponse::from)
                .orElseThrow(EmptyArchiveException::new);
    }

    /**
     * Removes the file of an upload whose row could not be saved, so the archive does not keep an image
     * no API can reach.
     *
     * <p>A failure here is logged rather than thrown: the caller is already unwinding from the failure
     * that matters, and replacing it would tell the client about the cleanup instead of about the upload.
     * The operator reads the identifier here and finds the file in {@code images/} by name.
     */
    private void discard(StoredFile stored) {
        try {
            storage.delete(stored);
        }
        catch (RuntimeException cleanupFailure) {
            log.error("The row for upload {} could not be saved and its stored file could not be removed; "
                    + "an orphan file is left in the images directory", stored.id(), cleanupFailure);
        }
    }
}
