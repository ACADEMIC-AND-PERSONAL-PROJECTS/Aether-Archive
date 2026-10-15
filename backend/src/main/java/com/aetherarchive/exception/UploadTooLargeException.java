package com.aetherarchive.exception;

/**
 * The upload is larger than {@code AETHER_MAX_UPLOAD_MB}.
 *
 * <p>Detected while the bytes are copied, not from a declared size, so a client that under-reports its
 * length is refused as well. The client caused this, so E1-S8 maps it to a 4xx — 413, "content too
 * large".
 */
public class UploadTooLargeException extends StorageException {

    /** Wire code of an upload above the configured size limit. */
    public static final String CODE = "upload-too-large";

    public UploadTooLargeException(String message) {
        super(CODE, message, null);
    }
}
