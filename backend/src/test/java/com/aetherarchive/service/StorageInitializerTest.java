package com.aetherarchive.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assumptions.assumeThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.aetherarchive.config.StorageProperties;

class StorageInitializerTest {

    private static final int MAX_UPLOAD_MB = 15;

    @TempDir
    Path tempDir;

    @Test
    void should_create_subdirectories_when_data_directory_is_absent() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");

        initializer(dataDir).initialize();

        assertThat(dataDir.resolve(StorageInitializer.IMAGES_DIR)).isDirectory();
        assertThat(dataDir.resolve(StorageInitializer.THUMBNAILS_DIR)).isDirectory();
        assertThat(dataDir.resolve(StorageInitializer.TMP_DIR)).isDirectory();
        assertThat(entries(dataDir)).containsExactlyInAnyOrder(
                dataDir.resolve(StorageInitializer.IMAGES_DIR),
                dataDir.resolve(StorageInitializer.THUMBNAILS_DIR),
                dataDir.resolve(StorageInitializer.TMP_DIR));
    }

    @Test
    void should_change_nothing_when_run_again_on_a_prepared_directory() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");
        Path image = dataDir.resolve(StorageInitializer.IMAGES_DIR).resolve("kept.png");
        Files.createDirectories(image.getParent());
        Files.writeString(image, "existing image");
        StorageInitializer initializer = initializer(dataDir);

        initializer.initialize();
        initializer.initialize();

        assertThat(Files.readString(image)).isEqualTo("existing image");
        assertThat(entries(dataDir.resolve(StorageInitializer.TMP_DIR))).isEmpty();
    }

    @Test
    void should_remove_stale_staging_entries_when_booting() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");
        Path tmpDir = dataDir.resolve(StorageInitializer.TMP_DIR);
        Files.createDirectories(tmpDir.resolve("nested"));
        Files.writeString(tmpDir.resolve("half-written-upload.tmp"), "partial");
        Files.writeString(tmpDir.resolve("nested").resolve("artifact.tmp"), "partial");

        initializer(dataDir).initialize();

        assertThat(entries(tmpDir)).isEmpty();
    }

    @Test
    void should_remove_stale_symlink_without_following_it_when_booting() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");
        Path tmpDir = dataDir.resolve(StorageInitializer.TMP_DIR);
        Path linkedDirectory = Files.createDirectories(tempDir.resolve("elsewhere"));
        Path precious = Files.writeString(linkedDirectory.resolve("keep.txt"), "not a staging artefact");
        Files.createDirectories(tmpDir);
        Files.createSymbolicLink(tmpDir.resolve("sneaky-link"), linkedDirectory);

        initializer(dataDir).initialize();

        assertThat(entries(tmpDir)).isEmpty();
        assertThat(Files.readString(precious)).isEqualTo("not a staging artefact");
    }

    @Test
    void should_fail_with_actionable_message_when_directory_cannot_be_created() throws IOException {
        Path readOnlyParent = Files.createDirectory(tempDir.resolve("read-only-parent"));
        Files.setPosixFilePermissions(readOnlyParent, PosixFilePermissions.fromString("r-xr-xr-x"));
        assumeThat(Files.isWritable(readOnlyParent)).isFalse();
        Path dataDir = readOnlyParent.resolve("aether-data");

        assertThatExceptionOfType(IllegalStateException.class)
                .isThrownBy(() -> initializer(dataDir).initialize())
                .withMessageContaining("Aether Archive cannot start")
                .withMessageContaining(dataDir.toString())
                .withMessageContaining("AETHER_DATA_DIR");
    }

    @Test
    void should_fail_when_staging_directory_exists_but_is_not_writable() throws IOException {
        Path dataDir = tempDir.resolve("aether-data");
        Path tmpDir = Files.createDirectories(dataDir.resolve(StorageInitializer.TMP_DIR));
        Files.createDirectories(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        Files.createDirectories(dataDir.resolve(StorageInitializer.THUMBNAILS_DIR));
        Files.setPosixFilePermissions(tmpDir, PosixFilePermissions.fromString("r-xr-xr-x"));
        assumeThat(Files.isWritable(tmpDir)).isFalse();

        assertThatExceptionOfType(IllegalStateException.class)
                .isThrownBy(() -> initializer(dataDir).initialize())
                .withMessageContaining("Aether Archive cannot start")
                .withMessageContaining(tmpDir.toString());
    }

    @Test
    void should_fail_when_data_directory_path_is_an_existing_file() throws IOException {
        Path dataDir = Files.writeString(tempDir.resolve("not-a-directory"), "a file");

        assertThatExceptionOfType(IllegalStateException.class)
                .isThrownBy(() -> initializer(dataDir).initialize())
                .withMessageContaining("Aether Archive cannot start")
                .withMessageContaining(dataDir.toString());
    }

    private StorageInitializer initializer(Path dataDir) {
        // StorageProperties rejects relative paths; @TempDir may hand out a relative one.
        return new StorageInitializer(new StorageProperties(dataDir.toAbsolutePath(), MAX_UPLOAD_MB));
    }

    private static List<Path> entries(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.toList();
        }
    }
}
