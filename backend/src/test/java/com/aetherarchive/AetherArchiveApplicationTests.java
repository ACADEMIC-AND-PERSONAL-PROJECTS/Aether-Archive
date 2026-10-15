package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * Boots the whole application, database included: Flyway applies the baseline to a throwaway
 * PostgreSQL container and {@code ddl-auto=validate} then proves the entities still match it, so
 * this context load is also the end-to-end check of the migration. No database has to be running
 * before the suite (ADR-009).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresTestConfiguration.class)
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

    @Test
    void should_keep_the_data_directory_under_the_system_temp_directory() {
        // Self-enforcing version of the promise in application-test.yml: tests never touch the real
        // data directory (AETHER_DATA_DIR stays unread in this profile).
        assertThat(storageProperties.dataDir().normalize())
                .startsWith(Path.of(System.getProperty("java.io.tmpdir")).normalize());
    }
}
