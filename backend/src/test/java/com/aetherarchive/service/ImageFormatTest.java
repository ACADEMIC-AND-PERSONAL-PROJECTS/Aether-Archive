package com.aetherarchive.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import com.aetherarchive.support.ImageFixtures;

class ImageFormatTest {

    @ParameterizedTest(name = "detects {0}")
    @MethodSource("acceptedSignatures")
    void should_detect_an_accepted_format_from_its_magic_bytes(String format, byte[] header,
            ImageFormat expected) {
        assertThat(ImageFormat.detect(header)).contains(expected);
    }

    static Stream<Arguments> acceptedSignatures() {
        return Stream.of(
                Arguments.of("JPEG", ImageFixtures.jpeg(), ImageFormat.JPEG),
                Arguments.of("PNG", ImageFixtures.png(), ImageFormat.PNG),
                Arguments.of("GIF89a", ImageFixtures.gif(), ImageFormat.GIF),
                Arguments.of("WEBP", ImageFixtures.webp(), ImageFormat.WEBP),
                Arguments.of("AVIF", ImageFixtures.avif(), ImageFormat.AVIF));
    }

    @Test
    void should_detect_gif87a_as_well_as_gif89a() {
        // The version character inside the signature is not the format.
        byte[] gif87a = Arrays.copyOf(ImageFixtures.gif(), ImageFormat.HEADER_LENGTH);
        gif87a[4] = '7';

        assertThat(ImageFormat.detect(gif87a)).contains(ImageFormat.GIF);
    }

    @ParameterizedTest(name = "resolves {0}")
    @ValueSource(strings = {"image/jpeg", "IMAGE/JPEG", " image/jpeg ", "image/jpeg; charset=binary",
            "image/jpg"})
    void should_resolve_a_declared_media_type_ignoring_case_and_parameters(String mediaType) {
        assertThat(ImageFormat.forMediaType(mediaType)).contains(ImageFormat.JPEG);
    }

    @ParameterizedTest(name = "refuses {0}")
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "text/plain", "application/octet-stream", "image/tiff",
            "image/svg+xml", "images/jpeg", "image/jpegx"})
    void should_not_resolve_a_media_type_that_is_not_an_accepted_image_type(String mediaType) {
        assertThat(ImageFormat.forMediaType(mediaType)).isEmpty();
    }

    @Test
    void should_not_detect_a_format_when_the_header_is_shorter_than_its_signature() {
        assertThat(ImageFormat.detect(truncated(ImageFixtures.jpeg(), 2))).isEmpty();
        assertThat(ImageFormat.detect(truncated(ImageFixtures.png(), 7))).isEmpty();
        assertThat(ImageFormat.detect(truncated(ImageFixtures.gif(), 5))).isEmpty();
        assertThat(ImageFormat.detect(truncated(ImageFixtures.webp(), 11))).isEmpty();
        assertThat(ImageFormat.detect(truncated(ImageFixtures.avif(), 11))).isEmpty();
    }

    @Test
    void should_not_detect_formats_that_share_a_container_with_an_accepted_one() {
        // A WAV file starts with RIFF like a WEBP, an MP4 with ftyp like an AVIF; the form type decides.
        assertThat(ImageFormat.detect(ascii("RIFF0000WAVE"))).isEmpty();
        assertThat(ImageFormat.detect(ascii("0000ftypmp42"))).isEmpty();
    }

    @Test
    void should_not_detect_bytes_that_are_not_an_image() {
        assertThat(ImageFormat.detect(ImageFixtures.text())).isEmpty();
        assertThat(ImageFormat.detect(ascii("%PDF-1.7"))).isEmpty();
        assertThat(ImageFormat.detect(new byte[0])).isEmpty();
        assertThat(ImageFormat.detect(null)).isEmpty();
    }

    @Test
    void should_expose_exactly_the_documented_extension_whitelist() {
        assertThat(ImageFormat.acceptedExtensions())
                .containsExactlyInAnyOrder("jpg", "jpeg", "png", "webp", "gif", "avif");
    }

    @Test
    void should_store_every_format_under_a_canonical_extension_it_accepts() {
        for (ImageFormat format : ImageFormat.values()) {
            assertThat(format.extensions()).contains(format.extension());
        }
        // JPEG is the only format with two spellings, and `jpg` is the one written to disk.
        assertThat(ImageFormat.JPEG.extension()).isEqualTo("jpg");
        assertThat(ImageFormat.JPEG.extensions()).containsExactly("jpg", "jpeg");
    }

    private static byte[] truncated(byte[] header, int length) {
        return Arrays.copyOf(header, length);
    }

    /** A twelve-byte header read from the ASCII text of a format the archive does not accept. */
    private static byte[] ascii(String text) {
        return Arrays.copyOf(text.getBytes(StandardCharsets.US_ASCII), ImageFormat.HEADER_LENGTH);
    }
}
