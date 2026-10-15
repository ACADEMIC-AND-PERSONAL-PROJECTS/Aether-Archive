package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.aetherarchive.config.StorageProperties;

@SpringBootTest
@ActiveProfiles("test")
class AetherArchiveApplicationTests {

    @Value("${spring.application.name}")
    private String applicationName;

    @Autowired
    private StorageProperties storageProperties;

    @Test
    void should_load_application_context_when_started() {
        // Loading the context is the real assertion; the name proves the YAML was
        // read from the test profile rather than from a default.
        assertThat(applicationName).isEqualTo("aether-archive");
    }

    @Test
    void should_prepare_data_directory_when_context_starts() {
        Path dataDir = storageProperties.dataDir();

        assertThat(dataDir).isAbsolute();
        assertThat(dataDir.resolve("images")).isDirectory();
        assertThat(dataDir.resolve("thumbnails")).isDirectory();
        assertThat(dataDir.resolve("tmp")).isDirectory();
    }
}
