package com.aetherarchive.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.domain.PhotoCategory;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.exception.EmptyArchiveException;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.ImageFixtures;

/**
 * Unit tests of the photo service: what an upload leaves on disk and in the database, what a refused
 * insert must not leave behind, and what the feed and the random photo publish.
 *
 * <p>Everything happens under {@link TempDir} — the developer's real data directory is never touched — and
 * the clock is fixed, so every stamp an assertion names is the one the archive wrote. The repository is a
 * mock: these are the service's rules, and the rules of the queries themselves are pinned against a real
 * PostgreSQL in {@code PhotoRepositoryTest}.
 */
class PhotoServiceTest {

    /** The instant {@link PhotoServiceTest}'s clock is fixed at, with non-zero sub-second digits. */
    private static final Instant UPLOADED_AT = Instant.parse("2026-10-15T09:30:45.123456Z");

    /** The smallest value {@link StorageProperties} accepts, so the size limit stays out of the way. */
    private static final int MAX_UPLOAD_MB = 1;

    @TempDir
    Path tempDir;

    private Path dataDir;

    private StorageService storage;

    private PhotoRepository photos;

    private PhotoService service;

    @BeforeEach
    void setUp() throws IOException {
        dataDir = tempDir.resolve("aether-data");
        Files.createDirectories(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        Files.createDirectories(dataDir.resolve(StorageInitializer.TMP_DIR));
        // StorageProperties rejects relative paths; @TempDir may hand out a relative one.
        storage = new StorageService(new StorageProperties(dataDir.toAbsolutePath(), MAX_UPLOAD_MB));
        photos = mock(PhotoRepository.class);
        service = new PhotoService(storage, photos, Clock.fixed(UPLOADED_AT, ZoneOffset.UTC));
    }

    @Test
    void should_stamp_the_upload_with_the_precision_the_database_keeps() {
        PhotoService serviceWithNanoseconds = new PhotoService(storage, photos,
                Clock.fixed(Instant.parse("2026-10-15T09:30:45.123456789Z"), ZoneOffset.UTC));
        given(photos.saveAndFlush(any(Photo.class))).willAnswer(invocation -> invocation.getArgument(0));

        PhotoResponse response = serviceWithNanoseconds.upload(
                upload("holiday.png", "image/png", ImageFixtures.png()), PhotoCategory.PICS);

        // `timestamptz` keeps microseconds. Stamping the JVM clock's finer digits would leave the 201 and
        // every feed that lists the same photo disagreeing about the instant it was uploaded at.
        assertThat(response.uploadedAt()).isEqualTo(Instant.parse("2026-10-15T09:30:45.123456Z"));
    }

    @Test
    void should_store_the_bytes_and_the_row_when_a_photo_is_uploaded() throws IOException {
        given(photos.saveAndFlush(any(Photo.class))).willAnswer(invocation -> invocation.getArgument(0));

        PhotoResponse response = service.upload(upload("holiday.png", "image/png", ImageFixtures.png()),
                PhotoCategory.ANIME);

        // The file keeps the bytes the client sent, under a name the archive generated: the identifier of
        // the row and the extension of the sniffed format, never the client's file name.
        Path stored = dataDir.resolve(response.url().substring(1));
        assertThat(stored).hasParent(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        assertThat(stored.getFileName().toString()).isEqualTo(response.id() + ".png");
        assertThat(Files.readAllBytes(stored)).isEqualTo(ImageFixtures.png());
        assertThat(stagingOf()).isEmpty();

        // The row: the file's identifier, and no item and no position — an upload is unassigned until it
        // is curated (ADR-011).
        ArgumentCaptor<Photo> saved = ArgumentCaptor.forClass(Photo.class);
        then(photos).should().saveAndFlush(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(response.id());
        assertThat(saved.getValue().getLocalFilePath()).isEqualTo("images/" + response.id() + ".png");
        assertThat(saved.getValue().getCategory()).isEqualTo(PhotoCategory.ANIME);
        assertThat(saved.getValue().getCreatedAt()).isEqualTo(UPLOADED_AT);
        assertThat(saved.getValue().getArchiveItem()).isNull();
        assertThat(saved.getValue().getDisplayOrder()).isNull();

        // And the published shape: a relative static path and the contract's lowercase category.
        assertThat(response.url()).isEqualTo("/images/" + response.id() + ".png");
        assertThat(response.category()).isEqualTo("anime");
        assertThat(response.uploadedAt()).isEqualTo(UPLOADED_AT);
    }

    @Test
    void should_remove_the_stored_file_when_the_row_cannot_be_saved() throws IOException {
        given(photos.saveAndFlush(any(Photo.class)))
                .willThrow(new DataIntegrityViolationException("refused by the database"));
        List<Path> imagesBefore = imagesOf();

        assertThatExceptionOfType(DataIntegrityViolationException.class)
                .isThrownBy(() -> service.upload(upload("holiday.png", "image/png", ImageFixtures.png()),
                        PhotoCategory.PICS))
                .withMessageContaining("refused by the database");

        // The bytes land before the insert, because the row is written from what the storage layer
        // reports; the file must therefore be gone again when the insert is refused. A photo the API
        // cannot reach is a file the owner would have to find and delete by hand.
        assertThat(imagesOf()).isEqualTo(imagesBefore).isEmpty();
        assertThat(stagingOf()).isEmpty();
    }

    @Test
    void should_answer_with_the_failure_of_the_row_when_the_stored_file_cannot_be_removed() throws IOException {
        Path imagesDir = dataDir.resolve(StorageInitializer.IMAGES_DIR);
        given(photos.saveAndFlush(any(Photo.class))).willAnswer(invocation -> {
            // The archive loses the images directory between the write and the insert, so the compensation
            // cannot run. A cleanup that cannot do its job is logged, never thrown: the client is owed the
            // answer about the failure that happened, not about the failure of the tidying up.
            deleteContents(imagesDir);
            Files.delete(imagesDir);
            throw new DataIntegrityViolationException("refused by the database");
        });

        DataIntegrityViolationException failure = catchThrowableOfType(
                DataIntegrityViolationException.class,
                () -> service.upload(upload("holiday.png", "image/png", ImageFixtures.png()),
                        PhotoCategory.PICS));

        assertThat(failure).isNotNull();
        assertThat(failure.getMessage()).isEqualTo("refused by the database");
    }

    @Test
    void should_refuse_a_random_photo_with_the_empty_archive_code_when_the_archive_holds_none() {
        given(photos.findRandom()).willReturn(Optional.empty());

        EmptyArchiveException refusal = catchThrowableOfType(EmptyArchiveException.class, service::findRandom);

        assertThat(refusal).isNotNull();
        assertThat(refusal.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(refusal.getBody().getProperties()).containsEntry("code", EmptyArchiveException.CODE);
        assertThat(refusal.getBody().getDetail()).contains("No photo has been archived yet");
    }

    @Test
    void should_publish_the_photo_the_repository_picked_when_one_is_asked_for_at_random() {
        given(photos.findRandom()).willReturn(Optional.of(ArchiveFixtures.unassignedPhoto(
                ArchiveFixtures.id(7))));

        PhotoResponse response = service.findRandom();

        assertThat(response.id()).isEqualTo(ArchiveFixtures.id(7));
        assertThat(response.url()).isEqualTo("/images/" + ArchiveFixtures.id(7) + ".jpg");
        assertThat(response.category()).isEqualTo(PhotoCategory.PICS.wireValue());
        assertThat(response.uploadedAt()).isEqualTo(ArchiveFixtures.CREATED_AT);
    }

    @Test
    void should_publish_the_feed_in_the_order_the_repository_returns() {
        // Newest first is the query's rule (PhotoRepositoryTest pins it against the database); the service
        // publishes what it is handed, in that order.
        given(photos.findAllByOrderByCreatedAtDescIdDesc()).willReturn(List.of(
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(2)),
                ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(1))));

        assertThat(service.findAll()).extracting(PhotoResponse::id)
                .containsExactly(ArchiveFixtures.id(2), ArchiveFixtures.id(1));
    }

    private static MultipartFile upload(String clientName, String mediaType, byte[] content) {
        return new MockMultipartFile("file", clientName, mediaType, content);
    }

    private List<Path> imagesOf() throws IOException {
        return entries(dataDir.resolve(StorageInitializer.IMAGES_DIR));
    }

    private List<Path> stagingOf() throws IOException {
        return entries(dataDir.resolve(StorageInitializer.TMP_DIR));
    }

    private static List<Path> entries(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.toList();
        }
    }

    private static void deleteContents(Path directory) throws IOException {
        List<Path> entries;
        try (Stream<Path> paths = Files.list(directory)) {
            entries = paths.toList();
        }
        for (Path entry : entries) {
            Files.delete(entry);
        }
    }
}
