package com.aetherarchive.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The database every integration test runs against: a throwaway PostgreSQL container, started when
 * the test context needs the datasource and gone when the JVM exits.
 *
 * <p>Two promises are kept here. The image tag is the one {@code docker-compose.dev.yml} runs, so
 * the suite cannot pass on a version the developer never touches (ADR-009). And no test waits for a
 * database someone started by hand — {@code @ServiceConnection} hands the container's address to
 * Spring, which is why the datasource settings in {@code application.yml} stay unused in tests.
 *
 * <p>Import it in every test that boots a context: {@code @Import(PostgresTestConfiguration.class)}.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestConfiguration {

    /** Keep in step with the {@code db} service of {@code docker-compose.dev.yml}. */
    public static final String POSTGRES_IMAGE = "postgres:17-alpine";

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse(POSTGRES_IMAGE));
    }
}
