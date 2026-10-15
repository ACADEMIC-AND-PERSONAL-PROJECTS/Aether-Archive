package com.aetherarchive.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC configuration: currently only CORS.
 *
 * <p>No mapping is registered when no origin is configured, so an empty
 * {@code aether.cors.allowed-origins} really means "no cross-origin access".
 */
@Configuration(proxyBeanMethods = false)
public class WebMvcConfig implements WebMvcConfigurer {

    private static final long CORS_MAX_AGE_SECONDS = 3600L;

    private static final Logger log = LoggerFactory.getLogger(WebMvcConfig.class);

    private final CorsProperties corsProperties;

    public WebMvcConfig(CorsProperties corsProperties) {
        this.corsProperties = corsProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (corsProperties.allowedOrigins().isEmpty()) {
            log.info("CORS disabled: no aether.cors.allowed-origins configured");
            return;
        }
        registry.addMapping("/**")
                .allowedOriginPatterns(corsProperties.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .maxAge(CORS_MAX_AGE_SECONDS)
                .allowCredentials(false);
        log.info("CORS enabled for origin patterns: {}", corsProperties.allowedOrigins());
    }
}
