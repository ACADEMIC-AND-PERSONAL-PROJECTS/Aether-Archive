package com.aetherarchive.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.aetherarchive.support.ContextFailures;

class CorsPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(CorsPropertiesConfiguration.class);

    @Test
    void should_bind_origin_patterns_when_property_is_comma_separated() {
        // Same value shape as .env.example, wildcard pattern included.
        runner.withPropertyValues(
                "aether.cors.allowed-origins=http://localhost:5173, http://192.168.*.*:5173")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(CorsProperties.class).allowedOrigins())
                            .containsExactly("http://localhost:5173", "http://192.168.*.*:5173");
                });
    }

    @Test
    void should_allow_no_origin_when_property_is_empty() {
        runner.withPropertyValues("aether.cors.allowed-origins=")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(CorsProperties.class).allowedOrigins()).isEmpty();
                });
    }

    @Test
    void should_allow_no_origin_when_property_is_absent() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(CorsProperties.class).allowedOrigins()).isEmpty();
        });
    }

    @ParameterizedTest
    @ValueSource(strings = { "*", "localhost:5173", "http://localhost:5173/", "http://localhost:5173/api" })
    void should_reject_origin_when_it_is_not_an_origin_pattern(String configuredOrigins) {
        runner.withPropertyValues("aether.cors.allowed-origins=" + configuredOrigins)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("must look like");
                });
    }

    @Test
    void should_keep_origin_patterns_when_list_is_built_in_code() {
        CorsProperties properties = new CorsProperties(List.of(" http://localhost:3000 ", ""));

        assertThat(properties.allowedOrigins()).containsExactly("http://localhost:3000");
    }

    @EnableConfigurationProperties(CorsProperties.class)
    static class CorsPropertiesConfiguration {
    }
}
