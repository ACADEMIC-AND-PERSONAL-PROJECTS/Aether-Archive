package com.aetherarchive.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.exception.StorageException;
import com.aetherarchive.exception.UnsupportedImageTypeException;
import com.aetherarchive.exception.UploadTooLargeException;

/**
 * Stores uploads in the data directory, safely (ARCHITECTURE §5, {@code .claude/rules/security.md}).
 *
 * <p><strong>Nothing about an upload is trusted.</strong> The client's file name is discarded — the
 * stored name is a UUID generated here — and a declared media type is only ever checked <em>against</em>
 * the bytes. An upload is accepted when, in this order:
 * <ol>
 *   <li>it is not empty,</li>
 *   <li>it declares an accepted image media type ({@link ImageFormat}),</li>
 *   <li>its first bytes carry the signature of that same format, and</li>
 *   <li>it does not exceed {@code AETHER_MAX_UPLOAD_MB}.</li>
 * </ol>
 * The stored extension comes from the sniffed format ({@link ImageFormat#extension()}), so a text file
 * named {@code holiday.jpg} is refused and a JPEG named {@code holiday.png} is stored as {@code .jpg}.
 *
 * <p><strong>Writes are atomic.</strong> The bytes go to a temporary file in the staging directory
 * {@code tmp/} — created on boot by {@link StorageInitializer} on the same filesystem as {@code images/}
 * — and are then moved with {@link StandardCopyOption#ATOMIC_MOVE}. A reader sees either the complete
 * file or no file at all, and every failure path deletes the temporary file.
 *
 * <p><strong>Every write stays inside the data directory.</strong> The destination is built from
 * generated values only and is checked, resolved, against the archive's real directories, so a {@code ../}
 * in a client file name never reaches the filesystem. An {@code images/} or {@code tmp/} symlinked
 * <em>outside</em> the data directory is refused with an actionable error instead of quietly putting the
 * archive's files outside its own tree (and outside its backups); a link that stays inside the data
 * directory is accepted, and the data directory itself may be a symlink (ADR-012).
 *
 * <p><strong>The size limit is enforced while copying</strong>, not from {@code Content-Length} or
 * {@link MultipartFile#getSize()}: a client that under-reports its length still hits the ceiling, because
 * the copy stops at the first byte over it.
 */
@Service
public class StorageService {

    /** The extensions a client is told about; derived from {@link ImageFormat}, never repeated by hand. */
    private static final String ACCEPTED_FORMATS = String.join(", ", ImageFormat.acceptedExtensions());

    /** Staged files are transient by construction; the suffix says so if one ever survives a crash. */
    private static final String STAGING_PREFIX = "upload-";

    private static final String STAGING_SUFFIX = ".part";

    private static final int COPY_BUFFER_SIZE = 8192;

    private static final long BYTES_PER_MB = 1024L * 1024L;

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);

    private final StorageProperties properties;

    public StorageService(StorageProperties properties) {
        this.properties = properties;
    }

    /**
     * Stores an upload and reports where it landed.
     *
     * @param file the multipart upload; its original file name is ignored entirely
     * @return the generated name and the path to persist as {@code Photo.localFilePath}
     * @throws UnsupportedImageTypeException when the upload is empty, is not an accepted image, or
     *     declares a media type that contradicts its own bytes
     * @throws UploadTooLargeException when the upload is larger than the configured maximum
     * @throws StorageException when the data directory is not usable or cannot be written to
     */
    public StoredFile store(MultipartFile file) {
        byte[] header = readHeader(file);
        if (header.length == 0) {
            throw new UnsupportedImageTypeException(
                    "the upload is empty; the archive accepts " + ACCEPTED_FORMATS);
        }
        String declaredMediaType = file.getContentType();
        ImageFormat declared = requireImageMediaType(declaredMediaType);
        ImageFormat detected = ImageFormat.detect(header)
                .orElseThrow(() -> new UnsupportedImageTypeException(
                        "the content of the upload is not a recognised image; the archive accepts "
                                + ACCEPTED_FORMATS));
        if (declared != detected) {
            throw new UnsupportedImageTypeException("the upload declares '" + declaredMediaType
                    + "' but its bytes are " + detected.name());
        }
        return writeAtomically(file, detected);
    }

    /** Stages the bytes in {@code tmp/} and moves them into {@code images/} in one filesystem step. */
    private StoredFile writeAtomically(MultipartFile file, ImageFormat format) {
        Path dataRoot = realDirectory(properties.dataDir(), "data directory");
        Path imagesDir = realDirectory(dataRoot.resolve(StorageInitializer.IMAGES_DIR), "'images' directory");
        requireInside(dataRoot, imagesDir, "the 'images' directory");
        Path tmpDir = realDirectory(dataRoot.resolve(StorageInitializer.TMP_DIR), "'tmp' directory");
        requireInside(dataRoot, tmpDir, "the 'tmp' directory");

        UUID id = UUID.randomUUID();
        String fileName = id + "." + format.extension();
        Path destination = imagesDir.resolve(fileName);
        requireInside(imagesDir, destination, "the stored upload");

        Path staging = null;
        long size;
        try {
            staging = Files.createTempFile(tmpDir, STAGING_PREFIX, STAGING_SUFFIX);
            size = copyWithLimit(file, staging);
            Files.move(staging, destination, StandardCopyOption.ATOMIC_MOVE);
        }
        catch (IOException ex) {
            throw new StorageException("the upload could not be written to the data directory; check that "
                    + "this process may write to AETHER_DATA_DIR and that the disk has free space", ex);
        }
        finally {
            removeStaging(staging);
        }

        StoredFile stored = new StoredFile(id, format.extension(),
                StorageInitializer.IMAGES_DIR + "/" + fileName);
        log.info("Stored upload {} ({} bytes) at {}", id, size, stored.relativePath());
        return stored;
    }

    /**
     * Copies the upload into the staged file, counting the bytes actually read and stopping at the first
     * one over the limit, so neither a header nor {@link MultipartFile#getSize()} can let a larger file
     * through.
     */
    private long copyWithLimit(MultipartFile file, Path staging) throws IOException {
        long limit = maxUploadBytes();
        long written = 0;
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        try (InputStream input = file.getInputStream();
                OutputStream output = Files.newOutputStream(staging)) {
            int read = input.read(buffer);
            while (read != -1) {
                written += read;
                if (written > limit) {
                    throw new UploadTooLargeException("the upload exceeds the maximum size of "
                            + properties.maxUploadMb() + " MB (AETHER_MAX_UPLOAD_MB)");
                }
                output.write(buffer, 0, read);
                read = input.read(buffer);
            }
        }
        return written;
    }

    private long maxUploadBytes() {
        return properties.maxUploadMb() * BYTES_PER_MB;
    }

    /** The first bytes of the upload: emptiness is judged from them, not from a declared size. */
    private static byte[] readHeader(MultipartFile file) {
        try (InputStream input = file.getInputStream()) {
            return input.readNBytes(ImageFormat.HEADER_LENGTH);
        }
        catch (IOException ex) {
            throw new StorageException("the upload could not be read", ex);
        }
    }

    private static ImageFormat requireImageMediaType(String mediaType) {
        return ImageFormat.forMediaType(mediaType)
                .orElseThrow(() -> new UnsupportedImageTypeException(describeMediaType(mediaType)));
    }

    private static String describeMediaType(String mediaType) {
        if (mediaType == null || mediaType.isBlank()) {
            return "the upload does not declare an image media type; the archive accepts " + ACCEPTED_FORMATS;
        }
        return "'" + mediaType + "' is not an image media type; the archive accepts " + ACCEPTED_FORMATS;
    }

    /** Removes the staged file after a failure; a successful move has already taken it away. */
    private static void removeStaging(Path staging) {
        if (staging == null) {
            return;
        }
        try {
            Files.deleteIfExists(staging);
        }
        catch (IOException ex) {
            log.warn("Could not remove the staged upload '{}'", staging, ex);
        }
    }

    /**
     * The real path of an existing directory of the archive — links resolved, so the containment checks
     * that follow compare real locations rather than the archive's names for them.
     */
    private static Path realDirectory(Path directory, String description) {
        Path real;
        try {
            real = directory.toRealPath();
        }
        catch (IOException ex) {
            log.error("The {} is not usable: '{}' cannot be resolved", description, directory, ex);
            throw new StorageException("the " + description + " is not usable (it is missing or cannot be "
                    + "read); the archive prepares the data directory at startup — check AETHER_DATA_DIR", ex);
        }
        if (!Files.isDirectory(real)) {
            log.error("The {} is not a directory: '{}'", description, real);
            throw new StorageException("the " + description + " is not a directory; check AETHER_DATA_DIR "
                    + "and the data directory layout");
        }
        return real;
    }

    /**
     * Proves a path stays inside the archive. The names are generated here — a UUID plus a known
     * extension — so nothing a client sends can reach this check; it stays explicit, and tested, because
     * the security rules require containment to be proved before a write, never assumed.
     */
    static void requireInside(Path root, Path candidate, String description) {
        if (!candidate.normalize().startsWith(root.normalize())) {
            log.error("Refused a write for {}: '{}' is not inside the data directory '{}'", description,
                    candidate, root);
            throw new StorageException("refused to write " + description + ": it resolves outside the data "
                    + "directory; the archive only writes inside AETHER_DATA_DIR");
        }
    }
}
