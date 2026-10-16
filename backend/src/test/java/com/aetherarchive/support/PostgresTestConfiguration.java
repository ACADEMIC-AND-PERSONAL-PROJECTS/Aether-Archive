package com.aetherarchive.support;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.jdbc.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The database every integration test runs against: <em>one</em> throwaway PostgreSQL container for the
 * whole test JVM, and inside it one database per test context.
 *
 * <p><strong>Why one container.</strong> The obvious wiring — a {@code @Bean} returning a fresh
 * {@link PostgreSQLContainer} — gives every test context a container of its own, and Spring gives every
 * test context a lifetime of its own: the cache key is the merged configuration, so two classes whose
 * annotations differ by a single property cannot share one. The suite pays the container start each
 * time, and it is not cheap: measured over the run that motivated this class, seven containers cost
 * between 3.4 s and 5.4 s each, some 28 s of a 69 s build. The container is therefore started once, in
 * the static initializer below, and every context is handed the same instance.
 *
 * <p><strong>Why the connection details are not a {@code @ServiceConnection}.</strong> That annotation
 * derives the datasource from the container's own URL, which names the container's single database — the
 * same one for every context. The contexts do not all tolerate that: {@code PhotoApiFlowTest} deletes
 * every photo, {@code DumpQueryTest} asserts that the archive holds exactly the dumps it published, and
 * the two classes that add a test-only Flyway folder would leave their {@code V999} in a database their
 * neighbours also connect to. So each context is given a {@link JdbcConnectionDetails} of its own,
 * naming the database it declares in {@link #DATABASE_PROPERTY} — a property every context that boots a
 * database has to set, see {@link #requireNamedDatabase} — created on the shared container the first time
 * it is asked for. The isolation the separate containers used to provide is kept, without the start.
 *
 * <p>The container is never stopped by Spring: it is not a bean, so the lifecycle that closes
 * Testcontainers beans on context close does not apply to it, and Testcontainers' own reaper — Ryuk, on
 * by default — removes it when the JVM exits. Nothing is left behind and no test waits for a database
 * someone started by hand: the datasource settings in {@code application.yml} stay unused in tests. The
 * reaper is a precondition rather than a detail, and the README says what a run leaves behind without it.
 *
 * <p>Import it in every test that boots a context: {@code @Import(PostgresTestConfiguration.class)}.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestConfiguration {

    /** Keep in step with the {@code db} service of {@code docker-compose.dev.yml}. */
    public static final String POSTGRES_IMAGE = "postgres:17-alpine";

    /** The property a test class names its database in; see {@link #requireNamedDatabase}. */
    public static final String DATABASE_PROPERTY = "aether.test.database";

    /** PostgreSQL's {@code duplicate_database}: a database another context already created is fine. */
    private static final String DUPLICATE_DATABASE = "42P04";

    /** A database name is interpolated into a {@code CREATE DATABASE} statement; nothing else is taken. */
    private static final Pattern DATABASE_NAME = Pattern.compile("[a-z][a-z0-9_]{0,40}");

    private static final PostgreSQLContainer<?> CONTAINER = startContainer();

    /**
     * The connection details of one test context's database, created if it does not exist yet.
     *
     * @param environment the environment the context named its database in
     */
    @Bean
    JdbcConnectionDetails postgresConnectionDetails(Environment environment) {
        String database = requireNamedDatabase(environment);
        createDatabase(database);
        return new PostgresConnectionDetails(database);
    }

    /**
     * The database this context named, or a failure that says it named none.
     *
     * <p>There is no default on purpose. Two contexts sharing one database has to be a decision a reader
     * can see in both classes — the four repository slices name {@code repository} in so many words — and
     * never the residue of whichever class happened to run first: {@code test} used to be handed to every
     * context that asked for nothing, which made the isolation of the whole suite rest on a rule nobody
     * had written down. A context that names nothing stops the build here, where the message can still say
     * what to add.
     */
    private static String requireNamedDatabase(Environment environment) {
        String database = environment.getProperty(DATABASE_PROPERTY);
        if (database == null) {
            throw new IllegalStateException("This test context boots a database but names none: add "
                    + "@TestPropertySource(properties = \"" + DATABASE_PROPERTY + "=<name>\") to the test "
                    + "class. Two classes may name the same database only when they agree to share it — "
                    + "neither reads a row the other wrote.");
        }
        return database;
    }

    private static PostgreSQLContainer<?> startContainer() {
        PostgreSQLContainer<?> container = new PostgreSQLContainer<>(DockerImageName.parse(POSTGRES_IMAGE));
        container.start();
        return container;
    }

    /**
     * Creates the database on the shared container, and treats "already there" as success: a context is
     * built once per JVM, but a database may be asked for by several of them.
     */
    private static void createDatabase(String database) {
        requireUsableName(database);
        try (Connection connection = DriverManager.getConnection(CONTAINER.getJdbcUrl(),
                CONTAINER.getUsername(), CONTAINER.getPassword());
                Statement statement = connection.createStatement()) {
            statement.execute("create database \"" + database + "\"");
        }
        catch (SQLException failure) {
            if (!DUPLICATE_DATABASE.equals(failure.getSQLState())) {
                throw new IllegalStateException("Could not create the test database '" + database + "'", failure);
            }
        }
    }

    private static void requireUsableName(String database) {
        if (!DATABASE_NAME.matcher(database).matches()) {
            throw new IllegalStateException(
                    "Not a usable test database name: '" + database + "'; expected " + DATABASE_NAME);
        }
    }

    /**
     * The container's address, resolved against one of its databases. The port is the one Docker published
     * for it, not the one PostgreSQL listens on inside the container.
     */
    private static final class PostgresConnectionDetails implements JdbcConnectionDetails {

        private final String jdbcUrl;

        PostgresConnectionDetails(String database) {
            this.jdbcUrl = "jdbc:postgresql://" + CONTAINER.getHost() + ":"
                    + CONTAINER.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT) + "/" + database;
        }

        @Override
        public String getUsername() {
            return CONTAINER.getUsername();
        }

        @Override
        public String getPassword() {
            return CONTAINER.getPassword();
        }

        @Override
        public String getJdbcUrl() {
            return jdbcUrl;
        }
    }
}
