package com.aetherarchive.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

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

    @ParameterizedTest
    @ValueSource(strings = { "https://*", "http://*:5173", "http://*:*" })
    void should_reject_origin_when_the_host_is_a_bare_wildcard(String configuredOrigins) {
        // `https://*` matches every origin, i.e. the wildcard the rule above tries to prevent.
        runner.withPropertyValues("aether.cors.allowed-origins=" + configuredOrigins)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("matches every origin");
                });
    }

    @ParameterizedTest
    @ValueSource(strings = { ",", "http://localhost:5173,", ",http://localhost:5173" })
    void should_reject_list_when_a_stray_comma_creates_a_blank_entry(String configuredOrigins) {
        runner.withPropertyValues("aether.cors.allowed-origins=" + configuredOrigins)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("must not contain a blank entry");
                });
    }

    @Test
    void should_trim_origin_patterns_when_list_is_built_in_code() {
        CorsProperties properties = new CorsProperties(List.of(" http://localhost:3000 "));

        assertThat(properties.allowedOrigins()).containsExactly("http://localhost:3000");
    }

    @Test
    void should_allow_no_origin_when_a_single_blank_entry_is_built_in_code() {
        CorsProperties properties = new CorsProperties(List.of(" "));

        assertThat(properties.allowedOrigins()).isEmpty();
    }

    @Test
    void should_reject_list_when_a_blank_entry_arrives_beside_another_one() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new CorsProperties(List.of("http://localhost:3000", "")))
                .withMessageContaining("must not contain a blank entry");
    }

    @EnableConfigurationProperties(CorsProperties.class)
    static class CorsPropertiesConfiguration {
    }
}
