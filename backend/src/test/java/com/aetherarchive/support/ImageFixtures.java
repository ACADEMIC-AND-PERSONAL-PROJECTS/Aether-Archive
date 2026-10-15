package com.aetherarchive.support;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Upload payloads, one per accepted image format.
 *
 * <p>Only the signature is significant: the archive recognises a format from its first bytes and stores
 * the bytes as they are, it never decodes the image. The payloads are therefore truncated but
 * deterministic — a browser upload, minus everything the upload path does not look at.
 */
public final class ImageFixtures {

    private ImageFixtures() {
    }

    /** {@code FF D8 FF}, then the start of a JFIF segment. */
    public static byte[] jpeg() {
        return new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10,
                'J', 'F', 'I', 'F', 0x00, 0x01};
    }

    /** The eight-byte PNG signature, then an IHDR chunk header. */
    public static byte[] png() {
        return new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00,
                0x0D};
    }

    /** A GIF89a stream. */
    public static byte[] gif() {
        return new byte[] {'G', 'I', 'F', '8', '9', 'a', 0x01, 0x00, 0x01, 0x00, (byte) 0x80, 0x00};
    }

    /** A RIFF container of form type {@code WEBP}, followed by a lossy chunk header. */
    public static byte[] webp() {
        return new byte[] {'R', 'I', 'F', 'F', 0x1A, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V',
                'P', '8', ' '};
    }

    /** An ISO base media file whose brand is {@code avif}. */
    public static byte[] avif() {
        return new byte[] {0x00, 0x00, 0x00, 0x1C, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f', 'm',
                'i', 'f', '1'};
    }

    /** Text: not an image, whatever a file name or a media type claims. */
    public static byte[] text() {
        return "this is a text file, not an image".getBytes(StandardCharsets.UTF_8);
    }

    /**
     * The payload padded with zero bytes to an exact length, for size-limit tests. The signature stays
     * intact, so only the length is under test.
     */
    public static byte[] padded(byte[] payload, int length) {
        return Arrays.copyOf(payload, length);
    }
}
