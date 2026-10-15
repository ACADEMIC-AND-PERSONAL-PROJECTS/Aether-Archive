package com.aetherarchive.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.Test;

class StorageExceptionTest {

    /**
     * The codes are what a client sees; renaming one is a change to the API, not a refactor. This test
     * is the place where that is written down, next to E1-S8 which maps them to HTTP statuses.
     */
    @Test
    void should_expose_the_documented_wire_codes() {
        assertThat(StorageException.CODE).isEqualTo("storage-failure");
        assertThat(UnsupportedImageTypeException.CODE).isEqualTo("unsupported-image-type");
        assertThat(UploadTooLargeException.CODE).isEqualTo("upload-too-large");
    }

    @Test
    void should_keep_its_message_and_cause_when_thrown() {
        IOException cause = new IOException("the disk went away");

        StorageException failure = new StorageException("the upload could not be written", cause);

        assertThat(failure.getCode()).isEqualTo(StorageException.CODE);
        assertThat(failure).hasMessage("the upload could not be written").hasCause(cause);
    }

    @Test
    void should_share_one_base_type_so_the_api_can_map_the_whole_family() {
        assertThat(new UnsupportedImageTypeException("not an image"))
                .isInstanceOf(StorageException.class)
                .hasMessage("not an image");
        assertThat(new UploadTooLargeException("too large"))
                .isInstanceOf(StorageException.class)
                .hasMessage("too large");
        assertThat(new UnsupportedImageTypeException("not an image").getCode())
                .isEqualTo(UnsupportedImageTypeException.CODE);
        assertThat(new UploadTooLargeException("too large").getCode())
                .isEqualTo(UploadTooLargeException.CODE);
    }
}
