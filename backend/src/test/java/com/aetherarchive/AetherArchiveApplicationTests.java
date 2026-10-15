package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class AetherArchiveApplicationTests {

    @Value("${spring.application.name}")
    private String applicationName;

    @Test
    void should_load_application_context_when_started() {
        // Loading the context is the real assertion; the name proves the YAML was
        // read from the test profile rather than from a default.
        assertThat(applicationName).isEqualTo("aether-archive");
    }
}
