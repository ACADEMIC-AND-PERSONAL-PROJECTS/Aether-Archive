package com.aetherarchive.exception;

/**
 * A failure while storing an upload.
 *
 * <p>Carries a stable {@code code} that the API exposes next to the RFC 9457 problem detail, so a
 * client can react to a situation instead of parsing a message; E1-S8 maps the storage exceptions to
 * their HTTP status. Messages are meant to be read by a human and never contain a filesystem path —
 * the operator finds the path in the log line the storage service writes when it refuses.
 */
public class StorageException extends RuntimeException {

    /** Wire code of an unexpected storage failure; the upload itself was acceptable. */
    public static final String CODE = "storage-failure";

    private final String code;

    public StorageException(String message) {
        this(CODE, message, null);
    }

    public StorageException(String message, Throwable cause) {
        this(CODE, message, cause);
    }

    /** For the subclasses, each of which names the situation it reports. */
    protected StorageException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    /** The stable, machine-readable code of this failure. */
    public String getCode() {
        return code;
    }
}
