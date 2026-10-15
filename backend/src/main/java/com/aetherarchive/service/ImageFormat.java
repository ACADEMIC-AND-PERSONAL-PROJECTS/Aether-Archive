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

    /** ISO base media file format: an {@code ftyp} box whose brand is {@code avif} or {@code avis}. */
    AVIF("avif", List.of("avif"), Set.of("image/avif"), ImageFormat::matchesAvif);

    /** Bytes needed to decide every format: WEBP and AVIF are only settled at offset 8. */
    public static final int HEADER_LENGTH = 12;

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

    private static boolean matchesAvif(byte[] header) {
        return matchesAscii(header, 4, "ftyp")
                && (matchesAscii(header, 8, "avif") || matchesAscii(header, 8, "avis"));
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
