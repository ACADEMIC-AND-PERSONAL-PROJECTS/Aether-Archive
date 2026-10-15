package com.aetherarchive.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Filesystem storage settings, bound from {@code aether.storage.*} at startup.
 *
 * <p>The data directory is validated eagerly: a blank or relative value is rejected instead of being
 * silently resolved against the working directory (which would put images inside the repository), and so
 * are the filesystem root and the user's home directory — the boot creates {@code images/},
 * {@code thumbnails/} and {@code tmp/} there and empties {@code tmp/}, which neither location is meant
 * for.
 *
 * @param dataDir absolute path to the data directory
 * @param maxUploadMb maximum size accepted per upload, in megabytes
 */
@ConfigurationProperties("aether.storage")
public record StorageProperties(Path dataDir, int maxUploadMb) {

    public static final int MIN_UPLOAD_MB = 1;
    public static final int MAX_UPLOAD_MB = 1024;

    public StorageProperties {
        if (dataDir == null || dataDir.toString().isBlank()) {
            throw new IllegalArgumentException(
                    "aether.storage.data-dir (AETHER_DATA_DIR) must not be blank; "
                            + "set it to an absolute directory path this process may write to");
        }
        if (!dataDir.isAbsolute()) {
            throw new IllegalArgumentException(
                    "aether.storage.data-dir (AETHER_DATA_DIR) must be absolute, got: " + dataDir);
        }
        dataDir = dataDir.normalize();
        requireNotFilesystemRoot(dataDir);
        requireNotHomeDirectory(dataDir);
        if (maxUploadMb < MIN_UPLOAD_MB || maxUploadMb > MAX_UPLOAD_MB) {
            throw new IllegalArgumentException(
                    "aether.storage.max-upload-mb (AETHER_MAX_UPLOAD_MB) must be between "
                            + MIN_UPLOAD_MB + " and " + MAX_UPLOAD_MB + ", got: " + maxUploadMb);
        }
    }

    private static void requireNotFilesystemRoot(Path dataDir) {
        if (dataDir.equals(dataDir.getRoot())) {
            throw new IllegalArgumentException(
                    "aether.storage.data-dir (AETHER_DATA_DIR) must not be the filesystem root ("
                            + dataDir + "); point it at a dedicated directory instead");
        }
    }

    private static void requireNotHomeDirectory(Path dataDir) {
        String home = System.getProperty("user.home");
        if (home == null || home.isBlank()) {
            return;
        }
        Path homeDirectory = Path.of(home).toAbsolutePath().normalize();
        if (dataDir.equals(homeDirectory)) {
            throw new IllegalArgumentException(
                    "aether.storage.data-dir (AETHER_DATA_DIR) must not be the user's home directory ("
                            + dataDir + "); point it at a dedicated directory inside it instead");
        }
    }
}
