package com.aetherarchive.exception;

/**
 * One field a request got wrong, as it appears in the {@code errors} collection of a validation problem.
 *
 * <p>Field and message only. The rejected value is deliberately absent: it is arbitrary client input —
 * an unbounded string, a file name, whatever the caller sent — and a response body is copied into logs,
 * bug reports and screenshots, which is not where it belongs. The validator's message says what the
 * field failed, the field name says where.
 *
 * @param field the name of the field as the client wrote it ({@code title}, {@code photoIds[2]})
 * @param message the validator's message, English, meant for whoever has to fix the request
 */
public record FieldViolation(String field, String message) {
}
