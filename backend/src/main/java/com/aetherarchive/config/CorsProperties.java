package com.aetherarchive.config;

import java.util.List;
import java.util.regex.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cross-origin settings, bound from {@code aether.cors.*} at startup.
 *
 * <p>Entries are <em>origin patterns</em>: Spring's CORS support does not resolve wildcards in plain
 * origins, so the documented value {@code http://192.168.*.*:5173} only works through
 * {@code allowedOriginPatterns}. An empty list means no cross-origin access at all — never "allow
 * everything".
 *
 * @param allowedOrigins origins and origin patterns allowed to call the API
 */
@ConfigurationProperties("aether.cors")
public record CorsProperties(List<String> allowedOrigins) {

    /** {@code scheme://authority} — no path, no trailing slash, no wildcard-only entry. */
    private static final Pattern ORIGIN_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.\\-]*://[^\\s/]+$");

    public CorsProperties {
        if (allowedOrigins == null) {
            allowedOrigins = List.of();
        }
        allowedOrigins = allowedOrigins.stream()
                .filter(origin -> origin != null && !origin.isBlank())
                .map(String::trim)
                .toList();
        allowedOrigins.forEach(CorsProperties::requireValidOrigin);
    }

    private static void requireValidOrigin(String origin) {
        if (!ORIGIN_PATTERN.matcher(origin).matches()) {
            throw new IllegalArgumentException(
                    "aether.cors.allowed-origins (AETHER_CORS_ALLOWED_ORIGINS) entries must look like "
                            + "http://localhost:5173 or http://192.168.*.*:5173 (scheme://host[:port], "
                            + "no path, no wildcard-only '*'), got: " + origin);
        }
    }
}
