package com.aetherarchive.domain;

import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The bucket a photo belongs to, as the contract defines it ({@code category} on the {@code Photo}
 * schema).
 *
 * <p>Two representations that must not drift apart, spelled out here so no caller has to guess
 * (ADR-011): the database stores the enum <em>name</em> ({@code SINGLE_PIC}-style uppercase, via
 * {@code @Enumerated(STRING)}), while the JSON wire value is lowercase — {@link #wireValue()} is
 * the single place that mapping is written down. E1-S6 turns requests into enum constants and
 * responses back into wire values.
 */
public enum PhotoCategory {

    PICS("pics"),
    ANIME("anime"),
    DUMP("dump"),
    UNCATEGORIZED("uncategorized");

    /**
     * The wire values indexed by themselves, so a request's {@code category} is looked up as the
     * contract spells it rather than through {@link #name()} — the two coincide today, and nothing
     * but this table makes them keep doing so.
     */
    private static final Map<String, PhotoCategory> BY_WIRE_VALUE = Arrays.stream(values())
            .collect(Collectors.toUnmodifiableMap(PhotoCategory::wireValue, Function.identity()));

    private final String wireValue;

    PhotoCategory(String wireValue) {
        this.wireValue = wireValue;
    }

    /**
     * The lowercase value used in JSON, e.g. {@code uncategorized}.
     *
     * @return the contract value of this category
     */
    public String wireValue() {
        return wireValue;
    }

    /**
     * The category a request named, as the contract writes it — how an upload's {@code category} field
     * becomes an enum constant.
     *
     * <p>Explicit on purpose: Spring's own converter would resolve the constant through
     * {@link #name()}, which is the <em>persistence</em> spelling, and would answer a client's typo
     * with a closed list nobody can extend without a code change. A caller that has already validated
     * the value — as the photo upload does with {@code ValidationConstraints.CATEGORY_PATTERN} — gets
     * the constant here; a caller that has not can answer the empty result itself.
     *
     * @param wireValue the value as it arrived, for example {@code pics}; may be null
     * @return the matching constant, or empty when the value is not one of the contract's
     */
    public static Optional<PhotoCategory> fromWireValue(String wireValue) {
        return wireValue == null ? Optional.empty() : Optional.ofNullable(BY_WIRE_VALUE.get(wireValue));
    }
}
