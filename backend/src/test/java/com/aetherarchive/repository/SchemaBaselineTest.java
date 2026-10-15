package com.aetherarchive.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The part of the migration contract {@code ddl-auto=validate} cannot check: Hibernate compares
 * column <em>types</em>, so an entity mapped to {@code varchar(80)} validates happily against a
 * {@code varchar(255)} column and only fails later, on a real value that is too long for the other
 * side. This pins length and nullability of every column, as
 * {@code db/migration/V1__baseline.sql} declares them.
 */
@DataJpaTest
@ActiveProfiles("test")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestConfiguration.class)
class SchemaBaselineTest {

    private static final String COLUMN_SQL = """
            select data_type, character_maximum_length, is_nullable
            from information_schema.columns
            where table_schema = current_schema() and table_name = ? and column_name = ?
            """;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @ParameterizedTest
    @MethodSource("expectedColumns")
    void should_declare_the_column_the_entity_maps(Column expected) {
        Map<String, Object> actual = jdbcTemplate.queryForMap(COLUMN_SQL, expected.table(), expected.column());

        assertThat(actual).containsEntry("data_type", expected.dataType());
        assertThat(actual).containsEntry("is_nullable", expected.nullable() ? "YES" : "NO");
        assertThat(actual.get("character_maximum_length")).isEqualTo(expected.maxLength());
    }

    private static Stream<Column> expectedColumns() {
        return Stream.of(
                new Column("archive_item", "id", "uuid", null, false),
                new Column("archive_item", "type", "character varying", 20, false),
                new Column("archive_item", "title", "character varying", 80, true),
                new Column("archive_item", "timestamp", "timestamp with time zone", null, false),
                new Column("archive_item", "background_color", "character varying", 7, false),
                new Column("photo", "id", "uuid", null, false),
                new Column("photo", "archive_item_id", "uuid", null, true),
                new Column("photo", "local_file_path", "character varying", 255, false),
                new Column("photo", "display_order", "integer", null, true),
                new Column("photo", "category", "character varying", 20, false),
                new Column("photo", "created_at", "timestamp with time zone", null, false));
    }

    /** One column of the baseline, as {@code information_schema} describes it. */
    private record Column(String table, String column, String dataType, Integer maxLength, boolean nullable) {
    }
}
