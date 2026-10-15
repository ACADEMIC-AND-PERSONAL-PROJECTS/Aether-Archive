package com.aetherarchive.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.aetherarchive.support.ContextFailures;

class StoragePropertiesTest {

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

    @EnableConfigurationProperties(StorageProperties.class)
    static class StoragePropertiesConfiguration {
    }
}
