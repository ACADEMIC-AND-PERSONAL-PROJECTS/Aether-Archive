package com.aetherarchive.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import jakarta.servlet.MultipartConfigElement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The container's ceilings are derived, so they are asserted as bytes: megabytes would hide the headroom
 * the request ceiling needs and the fact that parts are never buffered.
 */
class MultipartConfigTest {

    /** Generous for a multipart envelope — boundaries, part headers and the category field. */
    private static final long TYPICAL_ENVELOPE_BYTES = 4096L;

    @TempDir
    Path tempDir;

    private final MultipartConfig config = new MultipartConfig();

    @ParameterizedTest(name = "derives the ceilings of a {0} MB limit")
    @ValueSource(ints = {1, 15, 1024})
    void should_derive_both_ceilings_from_the_configured_upload_size(int maxUploadMb) {
        MultipartConfigElement element = config.multipartConfigElement(properties(maxUploadMb));
        long maxFileBytes = maxUploadMb * 1024L * 1024L;

        assertThat(element.getMaxFileSize()).isEqualTo(maxFileBytes);
        assertThat(element.getMaxRequestSize())
                .isEqualTo(maxFileBytes + MultipartConfig.MAX_REQUEST_HEADROOM_BYTES);
        assertThat(element.getFileSizeThreshold()).isZero();
    }

    @Test
    void should_leave_the_multipart_envelope_room_above_the_file_ceiling() {
        // A file at the documented limit must pass the container's request check with its framing on
        // top; without the headroom the container refuses the very size the archive documents.
        MultipartConfigElement element = config.multipartConfigElement(properties(15));

        assertThat(element.getMaxRequestSize())
                .isGreaterThan(element.getMaxFileSize() + TYPICAL_ENVELOPE_BYTES);
    }

    private StorageProperties properties(int maxUploadMb) {
        // StorageProperties rejects relative paths; @TempDir may hand out a relative one.
        return new StorageProperties(tempDir.toAbsolutePath(), maxUploadMb);
    }
}
