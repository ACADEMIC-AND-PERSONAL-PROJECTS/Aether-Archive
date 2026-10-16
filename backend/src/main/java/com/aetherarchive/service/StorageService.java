package com.aetherarchive.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.regex.Pattern;

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
 * <p><strong>Writes are atomic and durable.</strong> The bytes go to a temporary file in the staging
 * directory {@code tmp/} — created on boot by {@link StorageInitializer} on the same filesystem as
 * {@code images/} — written through a synchronised stream, and then moved with
 * {@link StandardCopyOption#ATOMIC_MOVE}. A reader sees either the complete file or no file at all, and
 * every failure path deletes the temporary file.
 *
 * <p><strong>Stored files are private.</strong> {@link Files#createTempFile} creates the staged file with
 * the owner-only mode ({@code 0600} on POSIX filesystems) and the move preserves it, so an image is
 * never readable by other users of the machine — deliberately, for an archive that is one person's. The
 * processes that read these files again run as the same user, so nothing has to change for the backups
 * of E6-S7 or the {@code /images/**} handler of E1-S5; a deployment that serves them as a different
 * user would have to revisit the mode rather than the other way round.
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

    /**
     * The longest declared media type echoed back in a refusal. Nothing about an upload is trusted, its
     * labels included: the value ends up in a problem detail and in a log line, so it is bounded.
     */
    private static final int MAX_ECHOED_MEDIA_TYPE_LENGTH = 100;

    /** Control characters, which would let a client forge lines or carry escapes into those messages. */
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("\\p{Cntrl}");

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
            throw new UnsupportedImageTypeException("the upload declares '"
                    + sanitiseMediaType(declaredMediaType) + "' but its bytes are " + detected.name());
        }
        return writeAtomically(file, detected);
    }

    /**
     * Removes a file this service stored, for a flow that could not complete — the bytes are in the data
     * directory but the row that would have described them is not, and an image no API can reach is a
     * file the owner would have to find and delete by hand.
     *
     * <p>The name is rebuilt here from the identifier and the <em>validated</em> extension of
     * {@link StoredFile}, never from the relative path: the two agree — {@link #store} writes them from
     * the same values — and rebuilding leaves nothing of a caller's string in the path. The destination
     * is then resolved and proved to stay inside {@code images/} before anything is deleted, the same
     * containment check the write path makes, because deletion follows a symlink just as a write does.
     *
     * <p>Idempotent: removing a file that is already gone is not a failure, so a retry after a partial
     * compensation cannot fail on the work it already did.
     *
     * @param stored the file {@link #store} returned
     * @throws StorageException when the data directory is not usable, or the file is there and cannot be
     *     removed
     */
    public void delete(StoredFile stored) {
        Path dataRoot = realDirectory(properties.dataDir(), "data directory");
        Path imagesDir = realDirectory(dataRoot.resolve(StorageInitializer.IMAGES_DIR), "'images' directory");
        requireInside(dataRoot, imagesDir, "the 'images' directory");
        Path target = imagesDir.resolve(stored.id() + "." + stored.extension());
        requireInside(imagesDir, target, "the stored upload");

        try {
            Files.deleteIfExists(target);
        }
        catch (IOException ex) {
            throw new StorageException("the stored upload could not be removed from the data directory; "
                    + "check that this process may write to AETHER_DATA_DIR", ex);
        }
        log.info("Removed stored upload {}", stored.id());
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
            // createTempFile gives the staged file the owner-only mode it keeps after the move.
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
     *
     * <p>This is the second stream opened on the upload — {@link #readHeader} opened the first — so it
     * relies on {@link MultipartFile#getInputStream()} starting a fresh stream at the first byte every
     * time, which is what Tomcat's servlet parts do (see {@link #readHeader}).
     */
    private long copyWithLimit(MultipartFile file, Path staging) throws IOException {
        long limit = maxUploadBytes();
        long written = 0;
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        // SYNC: every byte is on the device before the move below publishes the file, so a power loss
        // cannot leave a correctly named file with unflushed content — data loss is this archive's top
        // risk. One flush per upload, negligible for a personal archive; a bulk import would revisit it.
        try (InputStream input = file.getInputStream();
                OutputStream output = Files.newOutputStream(staging, StandardOpenOption.CREATE,
                        StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE,
                        StandardOpenOption.SYNC)) {
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

    /**
     * The first bytes of the upload: emptiness is judged from them, not from a declared size.
     *
     * <p>The store opens two streams on the same upload — this one, then the copy in
     * {@link #copyWithLimit} — which is only correct because {@link MultipartFile#getInputStream()}
     * returns a fresh stream positioned at the first byte on every call. That holds for the servlet
     * parts of Tomcat 10.1 (the container this application runs on), whose {@code getInputStream()}
     * re-opens the part; it is a property of the multipart implementation, not of the interface, and
     * {@code MockMultipartFile} cannot catch a regression. Verify it before changing containers.
     */
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
        return "'" + sanitiseMediaType(mediaType) + "' is not an image media type; the archive accepts "
                + ACCEPTED_FORMATS;
    }

    /**
     * The client's declared media type, made safe to repeat. It is echoed in the two refusals that
     * mention it — never the file name, which is discarded entirely — and it arrives from a client, so it
     * is stripped of control characters (which could forge a line in the log) and cut to
     * {@link #MAX_ECHOED_MEDIA_TYPE_LENGTH} characters (which is all a reader needs to recognise the
     * mistake, and bounds what a client can push into a response).
     */
    private static String sanitiseMediaType(String mediaType) {
        String printable = CONTROL_CHARACTERS.matcher(mediaType).replaceAll("");
        if (printable.length() <= MAX_ECHOED_MEDIA_TYPE_LENGTH) {
            return printable;
        }
        return printable.substring(0, MAX_ECHOED_MEDIA_TYPE_LENGTH) + "...";
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
