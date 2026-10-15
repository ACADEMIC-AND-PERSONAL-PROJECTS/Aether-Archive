package com.aetherarchive.support;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Upload payloads, one per accepted image format.
 *
 * <p>Only the signature is significant: the archive recognises a format from its first bytes and stores
 * the bytes as they are, it never decodes the image. The payloads are therefore truncated but
 * deterministic — a browser upload, minus everything the upload path does not look at.
 *
 * <p>The ISO base media builders ({@link #ftyp}, {@link #ftypDeclaringSize}) exist because an AVIF is
 * recognised from its whole {@code ftyp} box rather than from one fixed offset: a test has to place a
 * brand in the major position, among the compatible ones, or outside the box's declared length.
 */
public final class ImageFixtures {

    /** Every field of an ISO base media box — its length, its type and each brand — is four bytes. */
    private static final int BRAND_LENGTH = 4;

    /** Before the compatible brands: the box length, the type {@code ftyp}, the major brand and the version. */
    private static final int FTYP_FIELDS = 4;

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

    /** An ISO base media file as a still AVIF writes it: major brand {@code avif}, then its brands. */
    public static byte[] avif() {
        return ftyp("avif", "mif1", "miaf");
    }

    /**
     * An {@code ftyp} box: its own length, the box type, the major brand, the minor version and the
     * compatible brands, big-endian and ASCII as the ISO base media format writes them. The box declares
     * its true length; {@link #ftypDeclaringSize} is the variant for boxes that lie about it.
     */
    public static byte[] ftyp(String majorBrand, String... compatibleBrands) {
        return buildFtyp(BRAND_LENGTH * (FTYP_FIELDS + compatibleBrands.length), majorBrand,
                compatibleBrands);
    }

    /**
     * The same box, declaring the given length whatever its content really is — how a malformed file
     * announces a box it does not have, and how a test proves the brand walk stops at the declared end.
     */
    public static byte[] ftypDeclaringSize(long declaredSize, String majorBrand,
            String... compatibleBrands) {
        return buildFtyp(declaredSize, majorBrand, compatibleBrands);
    }

    private static byte[] buildFtyp(long declaredSize, String majorBrand, String[] compatibleBrands) {
        byte[] box = new byte[BRAND_LENGTH * (FTYP_FIELDS + compatibleBrands.length)];
        for (int index = 0; index < BRAND_LENGTH; index++) {
            box[index] = (byte) (declaredSize >>> (8 * (BRAND_LENGTH - 1 - index)));
        }
        writeAscii(box, BRAND_LENGTH, "ftyp");
        writeAscii(box, 2 * BRAND_LENGTH, majorBrand);
        for (int index = 0; index < compatibleBrands.length; index++) {
            writeAscii(box, (FTYP_FIELDS + index) * BRAND_LENGTH, compatibleBrands[index]);
        }
        return box;
    }

    private static void writeAscii(byte[] box, int offset, String field) {
        if (field.length() != BRAND_LENGTH || !StandardCharsets.US_ASCII.newEncoder().canEncode(field)) {
            throw new IllegalArgumentException(
                    "an ISO base media field is exactly four ASCII bytes, got: " + field);
        }
        System.arraycopy(field.getBytes(StandardCharsets.US_ASCII), 0, box, offset, BRAND_LENGTH);
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
