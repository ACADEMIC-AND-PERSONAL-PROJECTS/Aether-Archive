package com.aetherarchive.config;

import java.util.List;
import java.util.regex.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cross-origin settings, bound from {@code aether.cors.*} at startup.
 *
 * <p>Entries are <em>origin patterns</em>: Spring's CORS support does not resolve wildcards in plain
 * origins, so the documented value {@code http://192.168.*.*:5173} only works through
 * {@code allowedOriginPatterns}. Wildcards inside the host are allowed, a host that is exactly {@code *}
 * is not: {@code https://*} would match every origin, which is the same as no CORS at all. An empty list
 * means no cross-origin access at all — never "allow everything".
 *
 * @param allowedOrigins origins and origin patterns allowed to call the API
 */
@ConfigurationProperties("aether.cors")
public record CorsProperties(List<String> allowedOrigins) {

    /** {@code scheme://authority} — no path, no trailing slash. */
    private static final Pattern ORIGIN_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.\\-]*://[^\\s/]+$");

    private static final String WILDCARD_HOST = "*";

    public CorsProperties {
        if (allowedOrigins == null) {
            allowedOrigins = List.of();
        }
        // A single empty value means "CORS disabled" (AETHER_CORS_ALLOWED_ORIGINS=); a blank entry inside
        // a longer list can only come from a stray comma and is a configuration error.
        if (allowedOrigins.size() > 1 && allowedOrigins.stream().anyMatch(CorsProperties::isBlank)) {
            throw new IllegalArgumentException(
                    "aether.cors.allowed-origins (AETHER_CORS_ALLOWED_ORIGINS) must not contain a blank "
                            + "entry; remove the stray comma, or leave the property empty to disable CORS: "
                            + allowedOrigins);
        }
        allowedOrigins = allowedOrigins.stream()
                .filter(origin -> !isBlank(origin))
                .map(String::trim)
                .toList();
        allowedOrigins.forEach(CorsProperties::requireValidOrigin);
    }

    private static boolean isBlank(String origin) {
        return origin == null || origin.isBlank();
    }

    private static void requireValidOrigin(String origin) {
        if (!ORIGIN_PATTERN.matcher(origin).matches()) {
            throw new IllegalArgumentException(
                    "aether.cors.allowed-origins (AETHER_CORS_ALLOWED_ORIGINS) entries must look like "
                            + "http://localhost:5173 or http://192.168.*.*:5173 (scheme://host[:port], "
                            + "no path, no wildcard-only '*'), got: " + origin);
        }
        if (WILDCARD_HOST.equals(hostOf(origin))) {
            throw new IllegalArgumentException(
                    "aether.cors.allowed-origins (AETHER_CORS_ALLOWED_ORIGINS) entries must name a host: '"
                            + origin + "' matches every origin. Use a concrete host, or wildcards inside "
                            + "it (http://192.168.*.*:5173)");
        }
    }

    /**
     * Host of an origin pattern ({@code scheme://[userinfo@]host[:port]}). Only precise enough to tell a
     * wildcard host ({@code https://*}) from one that merely contains wildcards
     * ({@code http://192.168.*.*:5173}).
     */
    private static String hostOf(String origin) {
        String authority = origin.substring(origin.indexOf("://") + 3);
        int userInfoEnd = authority.lastIndexOf('@');
        if (userInfoEnd >= 0) {
            authority = authority.substring(userInfoEnd + 1);
        }
        int portStart = authority.lastIndexOf(':');
        return portStart >= 0 ? authority.substring(0, portStart) : authority;
    }
}
