package com.aetherarchive.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Filesystem storage settings, bound from {@code aether.storage.*} at startup.
 *
 * <p>The data directory is validated eagerly: a blank or relative value is rejected instead of being
 * silently resolved against the working directory (which would put images inside the repository).
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
                            + "set it to an absolute path outside the repository");
        }
        if (!dataDir.isAbsolute()) {
            throw new IllegalArgumentException(
                    "aether.storage.data-dir (AETHER_DATA_DIR) must be absolute, got: " + dataDir);
        }
        dataDir = dataDir.normalize();
        if (maxUploadMb < MIN_UPLOAD_MB || maxUploadMb > MAX_UPLOAD_MB) {
            throw new IllegalArgumentException(
                    "aether.storage.max-upload-mb (AETHER_MAX_UPLOAD_MB) must be between "
                            + MIN_UPLOAD_MB + " and " + MAX_UPLOAD_MB + ", got: " + maxUploadMb);
        }
    }
}
