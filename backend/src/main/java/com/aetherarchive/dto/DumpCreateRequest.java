package com.aetherarchive.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The body of {@code POST /api/v1/dumps}: the {@code DumpCreate} schema of {@code _docs/openapi.yml}.
 *
 * <p>Every limit comes from {@link ValidationConstraints}, so the annotation, the message the API answers
 * and the test that proves it cannot drift: {@code backgroundColor} is a {@code #RRGGBB} triple and
 * {@code photoIds} holds exactly {@value ValidationConstraints#DUMP_PHOTO_COUNT} identifiers.
 *
 * <p><strong>{@code title} is optional</strong>, although the schema lists it as required (ADR-011):
 * accepting a body without one is a superset of the bodies the schema describes, and every conforming
 * client is unaffected. A title that is present is at most {@value ValidationConstraints#TITLE_MAX_LENGTH}
 * characters.
 *
 * <p><strong>What this record cannot state belongs to the service.</strong> Bean validation can bound the
 * count of {@code photoIds}, but not that the six are <em>different</em>, that each names a photo in the
 * archive, or that none is already curated into another item: those compare the request with itself and
 * with the archive, and {@code DumpService} refuses them with the same 400 body, an {@code errors} entry
 * against this same field.
 *
 * @param title the dump's name, or null for an unnamed one
 * @param backgroundColor the "aura" drawn behind the dump, always {@code #RRGGBB}
 * @param photoIds exactly six photo identifiers, in the order the dump displays them
 */
public record DumpCreateRequest(
        @Size(max = ValidationConstraints.TITLE_MAX_LENGTH) String title,
        @NotBlank
        @Pattern(regexp = ValidationConstraints.BACKGROUND_COLOR_PATTERN) String backgroundColor,
        @NotNull
        @Size(min = ValidationConstraints.DUMP_PHOTO_COUNT, max = ValidationConstraints.DUMP_PHOTO_COUNT,
                message = "must name exactly " + ValidationConstraints.DUMP_PHOTO_COUNT + " photos")
        List<@NotNull UUID> photoIds) {
}
