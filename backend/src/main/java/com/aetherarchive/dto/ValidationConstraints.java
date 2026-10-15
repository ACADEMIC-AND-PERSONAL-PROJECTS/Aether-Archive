package com.aetherarchive.dto;

/**
 * The request limits the specs fix, written once so a DTO and the test that proves it cannot drift.
 *
 * <p>A DTO names these constants inside its Jakarta Validation annotations — {@code @Size(max =
 * ValidationConstraints.TITLE_MAX_LENGTH)}, {@code @Pattern(regexp = ValidationConstraints
 * .BACKGROUND_COLOR_PATTERN)} — so one number decides the annotation, the validation message the API
 * returns and what the tests assert. Changing a limit is a change to the API, not a refactor.
 *
 * <p>Two constraints deliberately live elsewhere. The upload size limit is configuration, not a constant:
 * it is {@link com.aetherarchive.config.StorageProperties#maxUploadMb()} and reaches the response through
 * {@code ApiExceptionHandler}. And "six <em>different</em> photos" is only half expressible as an
 * annotation — {@link #DUMP_PHOTO_COUNT} bounds the count, distinctness is a service rule, which is where
 * the dump rules are enforced.
 */
public final class ValidationConstraints {

    /** Maximum length of a dump title in characters; the title stays optional (ADR-011). */
    public static final int TITLE_MAX_LENGTH = 80;

    /** The only colour format the archive stores, {@code #RRGGBB}, as the specs write it. */
    public static final String BACKGROUND_COLOR_PATTERN = "^#[0-9a-fA-F]{6}$";

    /** Number of photos a monthly dump holds; the order of the ids is the display order. */
    public static final int DUMP_PHOTO_COUNT = 6;

    private ValidationConstraints() {
    }
}
