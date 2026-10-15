package com.aetherarchive.domain;

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
}
