package com.aetherarchive.config;

import jakarta.servlet.MultipartConfigElement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The servlet container's multipart ceilings, computed from the same property the upload service enforces.
 *
 * <p>Without this bean Tomcat would apply Spring Boot's one-megabyte default and refuse a legitimate
 * upload with a 413 before {@link com.aetherarchive.service.StorageService} ever sees the bytes — the
 * configured {@code AETHER_MAX_UPLOAD_MB} would be a lie at the HTTP boundary. Spring Boot's
 * auto-configuration backs off when a {@link MultipartConfigElement} bean exists, so this is the single
 * source of truth for both ceilings rather than an override of a second one.
 *
 * <p><strong>Two ceilings, not one.</strong> The file ceiling is {@code max-upload-mb} exactly. The
 * request ceiling is that plus {@link #MAX_REQUEST_HEADROOM_BYTES}, because every multipart request also
 * carries its boundaries, the part headers and the {@code category} field: with equal ceilings the
 * container refuses a file <em>at</em> the documented limit, which is a refusal the service never gets to
 * make and the README's promise does not survive.
 *
 * <p>The location stays the container's own temporary directory: parts are staged on disk (a threshold of
 * zero) only for as long as one request is being parsed, and the archive's own staging directory remains
 * {@code StorageService}'s business alone.
 */
@Configuration(proxyBeanMethods = false)
public class MultipartConfig {

    /**
     * Room for the multipart envelope of one upload. Far more than boundaries and part headers need, and
     * small enough that a request is still bounded before the service reads a byte of it.
     */
    static final long MAX_REQUEST_HEADROOM_BYTES = 1024L * 1024L;

    private static final long BYTES_PER_MB = 1024L * 1024L;

    /** Stage every part on disk from its first byte; a large upload must never sit in memory. */
    private static final int STAGE_ON_DISK = 0;

    private static final Logger log = LoggerFactory.getLogger(MultipartConfig.class);

    @Bean
    public MultipartConfigElement multipartConfigElement(StorageProperties storageProperties) {
        long maxFileBytes = storageProperties.maxUploadMb() * BYTES_PER_MB;
        long maxRequestBytes = maxFileBytes + MAX_REQUEST_HEADROOM_BYTES;
        log.info("Multipart uploads: files up to {} bytes, requests up to {} bytes, staged on disk",
                maxFileBytes, maxRequestBytes);
        return new MultipartConfigElement(null, maxFileBytes, maxRequestBytes, STAGE_ON_DISK);
    }
}
