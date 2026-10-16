package com.aetherarchive.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * A throwaway data directory for a test that boots a context: created before the context starts, removed
 * when the class that owns it finishes.
 *
 * <p>A context test cannot use JUnit's {@code @TempDir} for this. The directory has to exist before the
 * first bean does — {@code aether.storage.data-dir} is read while the context is built, from the
 * {@code @DynamicPropertySource} method that creates it here — so JUnit's lifecycle never gets the chance,
 * and the cleanup has to be asked for explicitly (an {@code @AfterAll} calling {@link #remove}).
 */
public final class TempDataDirectory {

    private TempDataDirectory() {
    }

    /** A new, empty directory under the system temp dir; never the developer's {@code AETHER_DATA_DIR}. */
    public static Path create(String prefix) throws IOException {
        return Files.createTempDirectory(prefix);
    }

    /** Removes the directory and everything under it; does nothing when it is already gone. */
    public static void remove(Path directory) throws IOException {
        if (directory == null || !Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
