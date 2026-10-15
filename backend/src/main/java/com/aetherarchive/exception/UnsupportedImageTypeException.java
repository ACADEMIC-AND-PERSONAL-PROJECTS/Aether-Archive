package com.aetherarchive.exception;

/**
 * The upload is not an image the archive accepts: it is empty, it declares a media type that is not an
 * accepted image type, its bytes carry no accepted signature, or the two contradict each other.
 *
 * <p>The client caused this, so E1-S8 maps it to a 4xx; the message says what was refused and which
 * formats the archive takes, and never echoes the client's file name.
 */
public class UnsupportedImageTypeException extends StorageException {

    /** Wire code of an upload that is not an accepted image. */
    public static final String CODE = "unsupported-image-type";

    public UnsupportedImageTypeException(String message) {
        super(CODE, message, null);
    }
}
