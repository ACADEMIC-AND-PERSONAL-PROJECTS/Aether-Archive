package com.aetherarchive.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * The archive holds no photo at all, so a request for a random one has nothing to answer with.
 *
 * <p><strong>Why this is an {@link ErrorResponseException} and not a plain runtime exception.</strong>
 * Nothing about an empty archive is a failure of the process: it is a state of the archive, and the
 * client is told so with a 404 it can show as an empty screen instead of an error. The archive states
 * its own refusals that way — after a controller saw the request — and {@code ApiExceptionHandler}
 * answers them with the sentence and the {@code code} the refusal itself carries, rather than flattening
 * them into a fixed message (ADR-013). That is exactly the mechanism this exception is raised through:
 * it is answered as a 404 carrying {@link #CODE}, so a client can tell "no photo yet" from "that path does
 * not exist" and from an archive failure — the three arrive with three different codes.
 *
 * <p>The detail is a sentence for the client, so it names no path, no class and no query.
 */
public class EmptyArchiveException extends ErrorResponseException {

    /** Wire code of a random-photo request over an archive that holds no photo yet. */
    public static final String CODE = "empty-archive";

    /**
     * The property {@code ApiExceptionHandler} reads the code from; spelled here as it is on the wire,
     * because that name is part of the response and not this class's business to change.
     */
    private static final String PROPERTY_CODE = "code";

    private static final String DETAIL = "No photo has been archived yet, so there is none to pick; "
            + "upload one and the archive will have something to show.";

    /** Builds the refusal: a 404, the archive's own sentence, and its own code. */
    public EmptyArchiveException() {
        super(HttpStatus.NOT_FOUND, body(), null);
    }

    private static ProblemDetail body() {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, DETAIL);
        body.setProperty(PROPERTY_CODE, CODE);
        return body;
    }
}
