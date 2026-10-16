package com.aetherarchive.exception;

import java.util.List;

/**
 * A dump request the service refused: the body was readable and passed every constraint Jakarta
 * Validation can state, and the refusal comes from a rule that compares the request with the archive —
 * six <em>different</em> identifiers, each naming a photo that exists, none of them curated already.
 *
 * <p>It is answered exactly as a rejected body is: a 400, the {@code validation-failure} code and an
 * {@code errors} collection naming {@code photoIds}, which is the point. Nothing about this refusal asks
 * the client to do anything but correct the body it sent, so it must not have to discover a second error
 * shape for the same repair; the service raises the violations and {@code ApiExceptionHandler} turns them
 * into the body it already produces for annotations.
 *
 * <p>The message carried to {@link RuntimeException} is for the log. The client only ever sees the
 * violations, each naming the field as it was sent and one sentence about what is wrong with it.
 */
public class DumpValidationException extends RuntimeException {

    private final List<FieldViolation> violations;

    /**
     * @param violations the rejected field entries, in the order the service found them; never empty
     */
    public DumpValidationException(List<FieldViolation> violations) {
        super("the dump request was refused: " + violations.size() + " field(s) rejected");
        this.violations = List.copyOf(violations);
    }

    /** The rejected fields, as they will appear in the problem detail's {@code errors} collection. */
    public List<FieldViolation> violations() {
        return violations;
    }
}
