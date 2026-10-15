package com.aetherarchive.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.util.stream.Stream;

import jakarta.persistence.Column;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * A persisted enum name is a constant name in a {@code varchar(20)} column ({@code archive_item.type},
 * {@code photo.category}). The width is read from the entity annotation, which
 * {@code SchemaBaselineTest} pins against the migration, so this test only has to hold the other end:
 * a constant that no longer fits would otherwise fail at insert time, on whichever run happens to
 * write it first, as a database error about a value nobody expected to be rejected.
 *
 * <p>A new constant also has to be added to the check constraints of its column (see
 * {@code db/migration}); the round-trip tests in the repository slices insert every constant and
 * fail until it is.
 */
class EnumColumnWidthTest {

    @ParameterizedTest
    @MethodSource("persistedConstantNames")
    void should_fit_the_column_when_a_constant_name_is_persisted(String constantName, int columnWidth) {
        assertThat(constantName).hasSizeLessThanOrEqualTo(columnWidth);
    }

    private static Stream<Arguments> persistedConstantNames() {
        return Stream.concat(
                persistedConstantNames(ItemType.class, ArchiveItem.class, "type"),
                persistedConstantNames(PhotoCategory.class, Photo.class, "category"));
    }

    private static <E extends Enum<E>> Stream<Arguments> persistedConstantNames(Class<E> constants,
            Class<?> entity, String fieldName) {
        int columnWidth = columnWidth(entity, fieldName);
        return Stream.of(constants.getEnumConstants())
                .map(constant -> Arguments.of(constant.name(), columnWidth));
    }

    private static int columnWidth(Class<?> entity, String fieldName) {
        try {
            return entity.getDeclaredField(fieldName).getAnnotation(Column.class).length();
        } catch (NoSuchFieldException e) {
            throw new IllegalStateException("Entity " + entity.getSimpleName() + " has no field "
                    + fieldName + " to read the column width from", e);
        }
    }
}
