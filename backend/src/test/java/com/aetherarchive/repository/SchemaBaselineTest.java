package com.aetherarchive.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import jakarta.persistence.Column;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The part of the migration contract {@code ddl-auto=validate} cannot check: Hibernate compares
 * column <em>types</em>, so an entity mapped to {@code varchar(80)} validates happily against a
 * {@code varchar(255)} column and only fails later, on a real value that is too long for the other
 * side.
 *
 * <p>The expectations are not a second, hand-kept copy of the schema: they are read from the
 * entities themselves — every {@code @Column} and {@code @JoinColumn} of {@code domain/ArchiveItem}
 * and {@code domain/Photo} — and confronted with what {@code information_schema} reports. Changing
 * an annotation without a matching migration therefore fails here, where the mismatch is visible,
 * instead of at insert time, where it is a runtime error about a value nobody expected to be
 * rejected.
 *
 * <p>Where an annotation says nothing, its own default is the expectation, never a constant
 * invented here: a text column that declares no {@code length} is expected to be
 * {@code varchar(255)}, a column that does not say {@code nullable = false} is expected to accept
 * nulls, and the type comes from the Java type through the map below. Those defaults are exactly
 * what Hibernate would put in the DDL it generates; the test only insists that the migration agrees
 * with them.
 */
@DataJpaTest
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=repository")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestConfiguration.class)
class SchemaBaselineTest {

    private static final String COLUMN_SQL = """
            select data_type, character_maximum_length, is_nullable
            from information_schema.columns
            where table_schema = current_schema() and table_name = ? and column_name = ?
            """;

    /**
     * The PostgreSQL type Hibernate derives from a Java type when the mapping says nothing else (no
     * {@code columnDefinition}). A new field type has to be added here deliberately — and the
     * migration has to agree with it.
     */
    private static final Map<Class<?>, String> SQL_TYPE_BY_JAVA_TYPE = Map.of(
            String.class, "character varying",
            UUID.class, "uuid",
            Integer.class, "integer",
            // The optimistic-locking counter of Photo, a primitive long: bigint.
            long.class, "bigint",
            Instant.class, "timestamp with time zone",
            // A @JoinColumn adopts the type of the referenced @Id: ArchiveItem.id is a uuid.
            ArchiveItem.class, "uuid");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @ParameterizedTest
    @MethodSource("mappedColumns")
    void should_declare_the_column_the_entity_maps(MappedColumn expected) {
        Map<String, Object> actual = jdbcTemplate.queryForMap(COLUMN_SQL, expected.table(),
                expected.column());

        assertThat(actual).containsEntry("data_type", expected.dataType());
        assertThat(actual).containsEntry("is_nullable", expected.nullable() ? "YES" : "NO");
        assertThat(actual.get("character_maximum_length")).isEqualTo(expected.maxLength());
    }

    private static Stream<MappedColumn> mappedColumns() {
        return Stream.<Class<?>>of(ArchiveItem.class, Photo.class)
                .flatMap(SchemaBaselineTest::mappedColumnsOf);
    }

    private static Stream<MappedColumn> mappedColumnsOf(Class<?> entity) {
        String table = entity.getAnnotation(Table.class).name();
        return Arrays.stream(entity.getDeclaredFields())
                .map(field -> mappedColumn(table, field))
                .flatMap(Optional::stream);
    }

    /** The column {@code field} maps, or empty for a field that is not mapped at all. */
    private static Optional<MappedColumn> mappedColumn(String table, Field field) {
        Column column = field.getAnnotation(Column.class);
        JoinColumn joinColumn = field.getAnnotation(JoinColumn.class);
        if (column == null && joinColumn == null) {
            return Optional.empty();
        }
        String name = column != null ? column.name() : joinColumn.name();
        if (name.isEmpty()) {
            throw new IllegalStateException("@" + (column != null ? "Column" : "JoinColumn") + " on "
                    + field.getDeclaringClass().getSimpleName() + "." + field.getName()
                    + " must name the column explicitly: the baseline does not follow a naming strategy");
        }
        boolean nullable = column != null ? column.nullable() : joinColumn.nullable();
        return Optional.of(new MappedColumn(table, name, sqlTypeOf(field.getType()),
                characterLength(field.getType(), column), nullable));
    }

    private static String sqlTypeOf(Class<?> javaType) {
        if (javaType.isEnum()) {
            // @Enumerated(EnumType.STRING): the constant's name, in a text column.
            return "character varying";
        }
        String sqlType = SQL_TYPE_BY_JAVA_TYPE.get(javaType);
        if (sqlType == null) {
            throw new IllegalStateException(
                    "Add the PostgreSQL type of " + javaType.getName() + " to SQL_TYPE_BY_JAVA_TYPE");
        }
        return sqlType;
    }

    /**
     * The {@code character_maximum_length} the mapping asks for: {@code @Column.length} for a text
     * column ({@code String}, or an enum persisted as its name), {@code null} — no length in
     * {@code information_schema} — for every type where the attribute means nothing.
     */
    private static Integer characterLength(Class<?> javaType, Column column) {
        if (column == null || !(javaType == String.class || javaType.isEnum())) {
            return null;
        }
        return column.length();
    }

    /** One mapped column: what the annotation promises, to be found in {@code information_schema}. */
    private record MappedColumn(String table, String column, String dataType, Integer maxLength,
            boolean nullable) {
    }
}
