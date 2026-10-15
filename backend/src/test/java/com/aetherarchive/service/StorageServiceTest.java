package com.aetherarchive.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.exception.StorageException;
import com.aetherarchive.exception.UnsupportedImageTypeException;
import com.aetherarchive.exception.UploadTooLargeException;
import com.aetherarchive.support.ImageFixtures;

/**
 * Unit tests of the upload path. Everything happens under {@link TempDir}: the developer's real data
 * directory ({@code AETHER_DATA_DIR}) is never touched, and no test sleeps or reaches the network.
 */
class StorageServiceTest {

    /** The smallest value {@link StorageProperties} accepts, so the size tests stay cheap. */
    private static final int MAX_UPLOAD_MB = 1;

    private static final long MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024L * 1024L;

    @TempDir
    Path tempDir;

    @ParameterizedTest(name = "stores a {0} upload as .{3}")
    @MethodSource("acceptedUploads")
    void should_store_an_accepted_format_under_its_sniffed_extension_when_the_client_name_says_otherwise(
            String format, byte[] payload, String mediaType, String extension) throws IOException {
        Path dataDir = dataDirectory();

        // A name that lies about the format: the extension on disk must come from the bytes.
        StoredFile stored = service(dataDir).store(upload("holiday.txt", mediaType, payload));

        assertThat(stored.extension()).isEqualTo(extension);
        assertThat(stored.relativePath()).isEqualTo("images/" + stored.id() + "." + extension);
        assertThat(Files.readAllBytes(dataDir.resolve(stored.relativePath()))).isEqualTo(payload);
        assertThat(imagesOf(dataDir)).containsExactly(dataDir.resolve(stored.relativePath()));
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    static Stream<Arguments> acceptedUploads() {
        return Stream.of(
                Arguments.of("JPEG", ImageFixtures.jpeg(), "image/jpeg", "jpg"),
                Arguments.of("PNG", ImageFixtures.png(), "image/png", "png"),
                Arguments.of("GIF", ImageFixtures.gif(), "image/gif", "gif"),
                Arguments.of("WEBP", ImageFixtures.webp(), "image/webp", "webp"),
                Arguments.of("AVIF", ImageFixtures.avif(), "image/avif", "avif"));
    }

    @ParameterizedTest(name = "ignores the client name {0}")
    @ValueSource(strings = {"../../etc/passwd.jpg", "..\\..\\windows\\system32.jpg",
            "....//....//etc/passwd.jpg", "/etc/passwd.jpg"})
    void should_treat_a_traversal_client_name_as_inert_when_storing(String clientName) throws IOException {
        Path dataDir = dataDirectory();

        StoredFile stored = service(dataDir).store(upload(clientName, "image/jpeg", ImageFixtures.jpeg()));

        assertThat(stored.relativePath()).matches("images/[0-9a-f-]{36}\\.jpg");
        assertThat(imagesOf(dataDir)).containsExactly(dataDir.resolve(stored.relativePath()));
        assertThat(tempDir.resolve("etc")).doesNotExist();
        assertThat(tempDir.resolve("passwd.jpg")).doesNotExist();
    }

    @Test
    void should_refuse_a_file_named_jpg_whose_bytes_are_not_a_jpeg() throws IOException {
        Path dataDir = dataDirectory();

        assertThatExceptionOfType(UnsupportedImageTypeException.class)
                .isThrownBy(() -> service(dataDir)
                        .store(upload("holiday.jpg", "image/jpeg", ImageFixtures.text())))
                .withMessageContaining("not a recognised image");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_an_upload_when_the_declared_media_type_contradicts_the_bytes() throws IOException {
        Path dataDir = dataDirectory();

        assertThatExceptionOfType(UnsupportedImageTypeException.class)
                .isThrownBy(() -> service(dataDir)
                        .store(upload("holiday.jpg", "image/jpeg", ImageFixtures.png())))
                .withMessageContaining("declares 'image/jpeg'")
                .withMessageContaining("but its bytes are PNG");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @ParameterizedTest(name = "refuses the declared media type {0}")
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "text/plain", "application/octet-stream", "image/tiff",
            "image/svg+xml"})
    void should_refuse_an_upload_whose_declared_media_type_is_not_an_accepted_image_type(String mediaType)
            throws IOException {
        Path dataDir = dataDirectory();

        assertThatExceptionOfType(UnsupportedImageTypeException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.jpg", mediaType, ImageFixtures.jpeg())))
                .withMessageContaining("image media type");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_an_empty_upload() throws IOException {
        Path dataDir = dataDirectory();

        assertThatExceptionOfType(UnsupportedImageTypeException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.png", "image/png", new byte[0])))
                .withMessageContaining("the upload is empty");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_an_upload_larger_than_the_configured_limit() throws IOException {
        Path dataDir = dataDirectory();
        byte[] tooLarge = ImageFixtures.padded(ImageFixtures.png(), (int) MAX_UPLOAD_BYTES + 1);

        assertThatExceptionOfType(UploadTooLargeException.class)
                .isThrownBy(() -> service(dataDir).store(upload("big.png", "image/png", tooLarge)))
                .withMessageContaining("exceeds the maximum size of " + MAX_UPLOAD_MB + " MB");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_an_oversized_upload_when_the_declared_size_under_reports_it() throws IOException {
        Path dataDir = dataDirectory();
        byte[] tooLarge = ImageFixtures.padded(ImageFixtures.png(), (int) MAX_UPLOAD_BYTES + 1);
        MockMultipartFile underReporting = new MockMultipartFile("file", "small.png", "image/png", tooLarge) {
            @Override
            public long getSize() {
                // A client can declare any size it likes; the limit is enforced on the bytes.
                return 32;
            }
        };

        assertThatExceptionOfType(UploadTooLargeException.class)
                .isThrownBy(() -> service(dataDir).store(underReporting))
                .withMessageContaining("exceeds the maximum size of " + MAX_UPLOAD_MB + " MB");

        assertThat(imagesOf(dataDir)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_accept_an_upload_of_exactly_the_configured_limit() throws IOException {
        Path dataDir = dataDirectory();
        byte[] atLimit = ImageFixtures.padded(ImageFixtures.png(), (int) MAX_UPLOAD_BYTES);

        StoredFile stored = service(dataDir).store(upload("big.png", "image/png", atLimit));

        assertThat(Files.size(dataDir.resolve(stored.relativePath()))).isEqualTo(MAX_UPLOAD_BYTES);
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_leave_nothing_staged_when_the_upload_cannot_be_written() throws IOException {
        Path dataDir = dataDirectory();
        MockMultipartFile breakingUpload = new MockMultipartFile("file", "holiday.jpg", "image/jpeg",
                ImageFixtures.jpeg()) {
            @Override
            public InputStream getInputStream() {
                // The signature arrives, then the stream breaks: the staging file already exists.
                return new FailingInputStream(ImageFixtures.jpeg());
            }
        };

        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> service(dataDir).store(breakingUpload))
                .withMessageContaining("could not be written")
                .satisfies(failure -> assertThat(failure.getMessage()).doesNotContain(tempDir.toString()));

        assertThat(stagingOf(dataDir)).isEmpty();
        assertThat(imagesOf(dataDir)).isEmpty();
    }

    @Test
    void should_leave_nothing_staged_when_the_images_directory_cannot_be_written() throws IOException {
        Path dataDir = dataDirectory();
        Path imagesDir = dataDir.resolve(StorageInitializer.IMAGES_DIR);
        Files.setPosixFilePermissions(imagesDir, PosixFilePermissions.fromString("r-xr-xr-x"));
        Assumptions.assumeFalse(Files.isWritable(imagesDir),
                "the images directory stayed writable (running as root or a permissions-ignoring "
                        + "filesystem): the unwritable destination cannot be exercised");

        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.png", "image/png", ImageFixtures.png())))
                .withMessageContaining("could not be written");

        assertThat(stagingOf(dataDir)).isEmpty();
        assertThat(imagesOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_an_images_directory_linked_outside_the_data_directory() throws IOException {
        Path dataDir = Files.createDirectories(tempDir.resolve("aether-data"));
        Files.createDirectories(dataDir.resolve(StorageInitializer.TMP_DIR));
        Path outside = Files.createDirectories(tempDir.resolve("outside"));
        createSymbolicLinkOrSkip(dataDir.resolve(StorageInitializer.IMAGES_DIR), outside);

        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.png", "image/png", ImageFixtures.png())))
                .withMessageContaining("outside the data directory")
                .satisfies(failure -> assertThat(failure.getMessage()).doesNotContain(tempDir.toString()));

        assertThat(entries(outside)).isEmpty();
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_store_through_an_images_directory_linked_inside_the_data_directory() throws IOException {
        Path dataDir = Files.createDirectories(tempDir.resolve("aether-data"));
        Files.createDirectories(dataDir.resolve(StorageInitializer.TMP_DIR));
        Path linkedImages = Files.createDirectories(dataDir.resolve("local-images"));
        createSymbolicLinkOrSkip(dataDir.resolve(StorageInitializer.IMAGES_DIR), linkedImages);

        StoredFile stored = service(dataDir).store(upload("holiday.png", "image/png", ImageFixtures.png()));

        assertThat(stored.relativePath()).isEqualTo("images/" + stored.id() + ".png");
        assertThat(Files.readAllBytes(linkedImages.resolve(stored.id() + ".png")))
                .isEqualTo(ImageFixtures.png());
        assertThat(stagingOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_a_staging_directory_linked_outside_the_data_directory() throws IOException {
        Path dataDir = Files.createDirectories(tempDir.resolve("aether-data"));
        Files.createDirectories(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        Path outside = Files.createDirectories(tempDir.resolve("outside"));
        createSymbolicLinkOrSkip(dataDir.resolve(StorageInitializer.TMP_DIR), outside);

        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.png", "image/png", ImageFixtures.png())))
                .withMessageContaining("the 'tmp' directory");

        assertThat(entries(outside)).isEmpty();
        assertThat(imagesOf(dataDir)).isEmpty();
    }

    @Test
    void should_refuse_storing_when_the_data_directory_was_never_initialised() throws IOException {
        Path dataDir = Files.createDirectories(tempDir.resolve("aether-data"));

        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> service(dataDir).store(upload("holiday.png", "image/png", ImageFixtures.png())))
                .withMessageContaining("AETHER_DATA_DIR")
                .satisfies(failure -> assertThat(failure.getMessage()).doesNotContain(tempDir.toString()));
    }

    @Test
    void should_refuse_a_path_that_escapes_the_root_when_containment_is_checked() throws IOException {
        Path imagesDir = Files.createDirectories(tempDir.resolve("images"));

        // The write site only ever passes a generated name, so the guard itself is proved here: no
        // `..`-laden path may satisfy it.
        assertThatExceptionOfType(StorageException.class)
                .isThrownBy(() -> StorageService.requireInside(imagesDir, imagesDir.resolve("../passwd.jpg"),
                        "the stored upload"))
                .withMessageContaining("outside the data directory");
    }

    /** The layout the boot creates, without the write probes: a data directory with images and tmp. */
    private Path dataDirectory() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");
        Files.createDirectories(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        Files.createDirectories(dataDir.resolve(StorageInitializer.TMP_DIR));
        return dataDir;
    }

    private StorageService service(Path dataDir) {
        // StorageProperties rejects relative paths; @TempDir may hand out a relative one.
        return new StorageService(new StorageProperties(dataDir.toAbsolutePath(), MAX_UPLOAD_MB));
    }

    private static MultipartFile upload(String clientName, String mediaType, byte[] content) {
        return new MockMultipartFile("file", clientName, mediaType, content);
    }

    private static List<Path> imagesOf(Path dataDir) throws IOException {
        return entries(dataDir.resolve(StorageInitializer.IMAGES_DIR));
    }

    private static List<Path> stagingOf(Path dataDir) throws IOException {
        return entries(dataDir.resolve(StorageInitializer.TMP_DIR));
    }

    private static List<Path> entries(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.toList();
        }
    }

    private static void createSymbolicLinkOrSkip(Path link, Path target) {
        try {
            Files.createSymbolicLink(link, target);
        }
        catch (UnsupportedOperationException | SecurityException | IOException ex) {
            Assumptions.abort("this platform does not support symbolic links: " + ex);
        }
    }

    /**
     * Yields the upload's signature and then breaks, so the store fails after the staging file has been
     * created — the failure the cleanup path exists for.
     */
    private static final class FailingInputStream extends InputStream {

        private final byte[] prefix;

        private int index;

        private FailingInputStream(byte[] prefix) {
            this.prefix = prefix;
        }

        @Override
        public int read() throws IOException {
            if (index < prefix.length) {
                return prefix[index++] & 0xFF;
            }
            throw new IOException("simulated failure while reading the upload");
        }
    }
}
