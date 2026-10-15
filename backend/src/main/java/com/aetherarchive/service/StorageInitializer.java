package com.aetherarchive.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

import com.aetherarchive.config.StorageProperties;

/**
 * Prepares the data directory at startup.
 *
 * <p>Creates {@code images/}, {@code thumbnails/} and {@code tmp/} idempotently, proves each of them is
 * really writable by writing and deleting a probe file, and empties {@code tmp/} — it only ever holds
 * incomplete staging artefacts, never user data (ARCHITECTURE §5).
 *
 * <p>A symlinked <em>data directory</em> (for example {@code ~/AetherArchive_Data -> /mnt/archive}) is
 * legitimate and keeps working. {@code tmp/} itself may not be a symbolic link: emptying it would follow
 * the link and delete entries the archive does not own.
 *
 * <p>Initialisation runs while the context is still refreshing, so an unusable data directory aborts the
 * boot instead of leaving a half-configured archive serving requests.
 */
@Component
public class StorageInitializer implements InitializingBean {

    /** Subdirectories of the data directory; the database lives in its own Docker volume. */
    public static final String IMAGES_DIR = "images";
    public static final String THUMBNAILS_DIR = "thumbnails";
    public static final String TMP_DIR = "tmp";

    private static final List<String> SUBDIRECTORIES = List.of(IMAGES_DIR, THUMBNAILS_DIR, TMP_DIR);

    private static final Logger log = LoggerFactory.getLogger(StorageInitializer.class);

    private final StorageProperties properties;

    public StorageInitializer(StorageProperties properties) {
        this.properties = properties;
    }

    @Override
    public void afterPropertiesSet() {
        initialize();
    }

    /**
     * Creates and validates the data directory. Idempotent: running it again on a prepared directory
     * changes nothing except clearing stale staging entries.
     *
     * @throws IllegalStateException when the data directory cannot be created, written to or emptied, or
     *     when the staging directory is a symbolic link
     */
    public void initialize() {
        Path dataDir = properties.dataDir();
        createDirectory(dataDir);

        Path tmpDir = dataDir.resolve(TMP_DIR);
        refuseSymlinkedStagingDirectory(tmpDir);
        SUBDIRECTORIES.forEach(name -> prepareDirectory(dataDir.resolve(name)));

        int removed = emptyTmp(tmpDir);
        if (removed > 0) {
            log.info("Emptied the staging directory on boot: {} stale entries removed from {}", removed, tmpDir);
        }
        log.info("Data directory ready: {}", dataDir);
    }

    /** Creates the subdirectory and proves it is writable, so a permission problem fails the boot. */
    private void prepareDirectory(Path directory) {
        createDirectory(directory);
        verifyWritable(directory);
    }

    /**
     * Refuses a staging directory that is itself a symbolic link: {@link Files#list} follows the link, so
     * emptying the staging area would delete entries outside the archive. The link is neither followed nor
     * deleted, and the check runs before anything reads or writes {@code tmp/}.
     */
    private void refuseSymlinkedStagingDirectory(Path tmpDir) {
        if (!Files.isSymbolicLink(tmpDir)) {
            return;
        }
        String message = "Aether Archive cannot start: the staging directory '" + tmpDir
                + "' is a symbolic link and its contents are deleted on every boot. The data directory "
                + "must contain real directories: point AETHER_DATA_DIR at the target location instead "
                + "(the data directory itself may be a symlink).";
        log.error(message);
        throw new IllegalStateException(message);
    }

    private void createDirectory(Path directory) {
        try {
            if (Files.isDirectory(directory)) {
                return;
            }
            Files.createDirectories(directory);
            log.info("Created data directory: {}", directory);
        }
        catch (IOException | SecurityException ex) {
            throw storageFailure("failed to create the directory", directory, ex);
        }
    }

    /**
     * Writes and deletes a probe file: {@code Files.isWritable} only reports access bits and happily
     * says "writable" for a read-only mount or a full disk.
     */
    private void verifyWritable(Path directory) {
        Path probe = directory.resolve(".write-probe-" + UUID.randomUUID());
        try {
            Files.writeString(probe, "aether-archive");
            Files.delete(probe);
        }
        catch (IOException | SecurityException ex) {
            try {
                Files.deleteIfExists(probe);
            }
            catch (IOException | SecurityException cleanupFailure) {
                log.debug("Could not remove the write probe '{}'", probe, cleanupFailure);
            }
            throw storageFailure("failed to write to the directory", directory, ex);
        }
    }

    private int emptyTmp(Path tmpDir) {
        List<Path> staleEntries;
        try (Stream<Path> entries = Files.list(tmpDir)) {
            staleEntries = entries.toList();
        }
        catch (IOException | SecurityException ex) {
            throw storageFailure("failed to read the staging directory", tmpDir, ex);
        }
        long removed = staleEntries.stream().filter(this::deleteEntry).count();
        return (int) removed;
    }

    private boolean deleteEntry(Path entry) {
        try {
            // Links are deleted, never followed: a symlink in the staging directory must not reach
            // outside of it.
            if (Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS)) {
                try (Stream<Path> children = Files.list(entry)) {
                    for (Path child : children.toList()) {
                        deleteEntry(child);
                    }
                }
            }
            Files.deleteIfExists(entry);
            return true;
        }
        catch (IOException | SecurityException ex) {
            log.warn("Could not remove the stale staging entry '{}' ({}); leaving it in place", entry,
                    describe(ex));
            return false;
        }
    }

    /**
     * Builds the boot-failure message. The reason is only appended when it says more than the path:
     * {@code AccessDeniedException.getMessage()} is the path itself.
     */
    private IllegalStateException storageFailure(String action, Path path, Exception cause) {
        String reason = describe(cause);
        String detail = path.toString().equals(reason) ? "" : " (" + reason + ")";
        String message = "Aether Archive cannot start: " + action + " '" + path + "'" + detail
                + ". Check AETHER_DATA_DIR and that this process can write to the data directory.";
        log.error(message);
        return new IllegalStateException(message, cause);
    }

    private static String describe(Exception ex) {
        String reason = ex.getMessage();
        return reason == null || reason.isBlank() ? ex.getClass().getSimpleName() : reason;
    }
}
