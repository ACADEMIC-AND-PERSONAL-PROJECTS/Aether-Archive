package com.aetherarchive.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.aetherarchive.support.ContextFailures;

class StoragePropertiesTest {

    @TempDir
    Path tempDir;

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(StoragePropertiesConfiguration.class);

    @Test
    void should_bind_and_normalise_absolute_data_dir_when_configuration_is_valid() {
        runner.withPropertyValues("aether.storage.data-dir=/tmp/aether/../aether-data",
                        "aether.storage.max-upload-mb=15")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    StorageProperties properties = context.getBean(StorageProperties.class);
                    assertThat(properties.dataDir()).isEqualTo(Path.of("/tmp/aether-data"));
                    assertThat(properties.maxUploadMb()).isEqualTo(15);
                });
    }

    @Test
    void should_reject_blank_data_dir_when_property_is_empty() {
        // `AETHER_DATA_DIR=` resolves to ""; taking it as a path would silently mean "the working
        // directory", i.e. images inside the repository.
        runner.withPropertyValues("aether.storage.data-dir=", "aether.storage.max-upload-mb=15")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("must not be blank");
                });
    }

    @Test
    void should_reject_relative_data_dir_when_property_is_not_absolute() {
        runner.withPropertyValues("aether.storage.data-dir=target/aether-data",
                        "aether.storage.max-upload-mb=15")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("must be absolute");
                });
    }

    @ParameterizedTest
    @ValueSource(ints = { -1, 0, 1025, 5000 })
    void should_reject_max_upload_mb_when_out_of_range(int maxUploadMb) {
        runner.withPropertyValues("aether.storage.data-dir=/tmp/aether-data",
                        "aether.storage.max-upload-mb=" + maxUploadMb)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(ContextFailures.causeChainMessages(context.getStartupFailure()))
                            .contains("must be between 1 and 1024");
                });
    }

    @ParameterizedTest
    @ValueSource(ints = { 1, 15, 1024 })
    void should_accept_max_upload_mb_when_within_range(int maxUploadMb) {
        runner.withPropertyValues("aether.storage.data-dir=/tmp/aether-data",
                        "aether.storage.max-upload-mb=" + maxUploadMb)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(StorageProperties.class).maxUploadMb()).isEqualTo(maxUploadMb);
                });
    }

    @Test
    void should_reject_data_dir_when_it_is_the_filesystem_root() {
        // The root of the @TempDir path is the filesystem root on every platform this runs on.
        Path root = tempDir.getRoot();

        assertThatIllegalArgumentException()
                .isThrownBy(() -> new StorageProperties(root, 15))
                .withMessageContaining("must not be the filesystem root")
                .withMessageContaining(root.toString());
    }

    @Test
    void should_reject_data_dir_when_it_is_the_home_directory() {
        // Read, never touched: the point is that this value is refused, not what it happens to be.
        Path home = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize();

        assertThatIllegalArgumentException()
                .isThrownBy(() -> new StorageProperties(home, 15))
                .withMessageContaining("must not be the user's home directory")
                .withMessageContaining(home.toString());
    }

    @EnableConfigurationProperties(StorageProperties.class)
    static class StoragePropertiesConfiguration {
    }
}
