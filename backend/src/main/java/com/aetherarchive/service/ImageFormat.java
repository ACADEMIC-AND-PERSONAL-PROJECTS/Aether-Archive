package com.aetherarchive.service;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

/**
 * The image formats an upload may have, recognised from the file's own bytes.
 *
 * <p>This enum is the single source of truth for what the archive accepts: the magic bytes that
 * identify a format, the extensions it may be stored under (the whitelist of
 * {@code .claude/rules/security.md}: {@code jpg jpeg png webp gif avif}) and the media types a client
 * may declare for it. Adding a format is adding a constant here; no other list has to follow.
 *
 * <p>Sniffing is hand-written on purpose: recognising a signature needs the first bytes and nothing
 * more, so an image library would be a dependency the upload path does not need. A payload is never
 * decoded — the archive stores bytes and decides their format, nothing else.
 *
 * <p>The stored extension is always the format's canonical one ({@link #extension()}), derived from
 * the bytes — never from a client's file name.
 */
public enum ImageFormat {

    /** {@code FF D8 FF}. {@code jpg} is canonical; {@code jpeg} is the same format, spelled out. */
    JPEG("jpg", List.of("jpg", "jpeg"), Set.of("image/jpeg", "image/jpg"), ImageFormat::matchesJpeg),

    /** The eight-byte PNG signature. */
    PNG("png", List.of("png"), Set.of("image/png"), ImageFormat::matchesPng),

    /** {@code GIF87a} or {@code GIF89a}: that trailing character is the version, not the format. */
    GIF("gif", List.of("gif"), Set.of("image/gif"), ImageFormat::matchesGif),

    /** A RIFF container whose form type is {@code WEBP}. */
    WEBP("webp", List.of("webp"), Set.of("image/webp"), ImageFormat::matchesWebp),

    /**
     * ISO base media file format: an {@code ftyp} box whose major brand or compatible brands name
     * {@code avif} or {@code avis}.
     */
    AVIF("avif", List.of("avif"), Set.of("image/avif"), ImageFormat::matchesAvif);

    /**
     * Bytes read from every upload to decide its format. WEBP is settled at offset 8 and needs twelve;
     * AVIF is settled by its {@code ftyp} box, whose brand list follows the box's own sixteen-byte
     * header — 64 bytes hold that header plus twelve brands, more than any encoder writes.
     */
    public static final int HEADER_LENGTH = 64;

    /** Every brand field of an ISO base media file is four ASCII bytes. */
    private static final int BRAND_LENGTH = 4;

    /** Offsets inside an {@code ftyp} box: the length at 0, the box type at 4, the major brand at 8. */
    private static final int FTYP_TYPE_OFFSET = 4;

    private static final int FTYP_MAJOR_BRAND_OFFSET = 8;

    /** The compatible brands start after the major brand and the minor version. */
    private static final int FTYP_COMPATIBLE_BRAND_OFFSET = 16;

    /** Shorter than this, an {@code ftyp} box cannot even carry the brands it exists for. */
    private static final int FTYP_MINIMUM_LENGTH = FTYP_COMPATIBLE_BRAND_OFFSET;

    private final String extension;

    private final List<String> extensions;

    private final Set<String> mediaTypes;

    private final Predicate<byte[]> signature;

    ImageFormat(String extension, List<String> extensions, Set<String> mediaTypes,
            Predicate<byte[]> signature) {
        if (!extensions.contains(extension)) {
            throw new IllegalArgumentException(extension + " is not one of the extensions of " + name());
        }
        this.extension = extension;
        this.extensions = List.copyOf(extensions);
        this.mediaTypes = Set.copyOf(mediaTypes);
        this.signature = signature;
    }

    /**
     * The canonical extension every stored file uses, without the dot.
     */
    public String extension() {
        return extension;
    }

    /**
     * Every spelling of this format's extension, canonical one first. {@code jpeg} belongs here so the
     * documented whitelist is complete, but only the canonical spelling is ever written to disk.
     */
    public List<String> extensions() {
        return extensions;
    }

    /**
     * The format a client-declared media type names, if any. Case is ignored and parameters such as
     * {@code ; charset=binary} are dropped, because clients are inconsistent about both.
     */
    public static Optional<ImageFormat> forMediaType(String mediaType) {
        String normalised = normalise(mediaType);
        if (normalised.isEmpty()) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(format -> format.mediaTypes.contains(normalised))
                .findFirst();
    }

    /**
     * The format the given bytes belong to, or empty when they match no accepted format. Pass the
     * first {@link #HEADER_LENGTH} bytes of the file; a shorter array is fine and simply matches only
     * the formats whose signature fits in it.
     */
    public static Optional<ImageFormat> detect(byte[] header) {
        if (header == null) {
            return Optional.empty();
        }
        return Arrays.stream(values()).filter(format -> format.signature.test(header)).findFirst();
    }

    /**
     * The extension whitelist as data, in declaration order and without duplicates — used to tell a
     * client what the archive takes instead of repeating the list in every refusal.
     */
    public static List<String> acceptedExtensions() {
        return Arrays.stream(values())
                .flatMap(format -> format.extensions.stream())
                .distinct()
                .toList();
    }

    private static String normalise(String mediaType) {
        if (mediaType == null) {
            return "";
        }
        int parameters = mediaType.indexOf(';');
        String type = parameters < 0 ? mediaType : mediaType.substring(0, parameters);
        return type.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean matchesJpeg(byte[] header) {
        return matchesBytes(header, 0, 0xFF, 0xD8, 0xFF);
    }

    private static boolean matchesPng(byte[] header) {
        return matchesBytes(header, 0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
    }

    private static boolean matchesGif(byte[] header) {
        return matchesAscii(header, 0, "GIF87a") || matchesAscii(header, 0, "GIF89a");
    }

    private static boolean matchesWebp(byte[] header) {
        // Bytes 4-7 are the RIFF chunk size and say nothing about the format.
        return matchesAscii(header, 0, "RIFF") && matchesAscii(header, 8, "WEBP");
    }

    /**
     * An ISO base media file (ISO/IEC 14496-12): an {@code ftyp} box at the very start of the file, whose
     * major brand or compatible brands name {@code avif} or {@code avis}. Encoders legitimately write
     * either: a still image majors in {@code avif}, a sequence in {@code avis}, and a file produced from
     * {@code mif1} lists the AVIF brand among its compatible ones instead.
     *
     * <p>The brand walk is bounded by the box's own declared length <em>and</em> by the header buffer, so
     * it never reads past what was read, let alone into pixel data. A box that cannot hold a brand — one
     * of the lengths that mean something else (0: to the end of the file; 1: a 64-bit length follows), or
     * less than the major brand, the version and a brand need — or a truncated header is refused: an
     * unparseable {@code ftyp} is not evidence of an image.
     */
    private static boolean matchesAvif(byte[] header) {
        if (!matchesAscii(header, FTYP_TYPE_OFFSET, "ftyp")) {
            return false;
        }
        long boxLength = readBoxLength(header);
        if (boxLength < FTYP_MINIMUM_LENGTH) {
            return false;
        }
        int readable = (int) Math.min(boxLength, header.length);
        if (matchesAvifBrand(header, FTYP_MAJOR_BRAND_OFFSET)) {
            return true;
        }
        for (int offset = FTYP_COMPATIBLE_BRAND_OFFSET; offset + BRAND_LENGTH <= readable;
                offset += BRAND_LENGTH) {
            if (matchesAvifBrand(header, offset)) {
                return true;
            }
        }
        return false;
    }

    private static boolean matchesAvifBrand(byte[] header, int offset) {
        return matchesAscii(header, offset, "avif") || matchesAscii(header, offset, "avis");
    }

    /** The length field every ISO base media box starts with: big-endian, unsigned, four bytes. */
    private static long readBoxLength(byte[] header) {
        if (header.length < Integer.BYTES) {
            return 0L;
        }
        long length = 0L;
        for (int index = 0; index < Integer.BYTES; index++) {
            length = (length << 8) | (header[index] & 0xFF);
        }
        return length;
    }

    /** Compares a signature positioned at {@code offset}; a header too short for it does not match. */
    private static boolean matchesBytes(byte[] header, int offset, int... expected) {
        if (header.length < offset + expected.length) {
            return false;
        }
        for (int index = 0; index < expected.length; index++) {
            if ((header[offset + index] & 0xFF) != expected[index]) {
                return false;
            }
        }
        return true;
    }

    /** The same comparison, for the ASCII markers embedded in the binary formats. */
    private static boolean matchesAscii(byte[] header, int offset, String marker) {
        return matchesBytes(header, offset, marker.chars().toArray());
    }
}
