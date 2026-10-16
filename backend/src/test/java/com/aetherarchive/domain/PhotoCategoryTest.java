package com.aetherarchive.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import com.aetherarchive.dto.ValidationConstraints;

/**
 * The category values are contract, not decoration: renaming one changes the JSON the frontend
 * reads (ADR-011). The persistence side is covered in {@code PhotoRepositoryTest}.
 */
class PhotoCategoryTest {

    @Test
    void should_map_every_constant_to_its_contract_value() {
        assertThat(PhotoCategory.PICS.wireValue()).isEqualTo("pics");
        assertThat(PhotoCategory.ANIME.wireValue()).isEqualTo("anime");
        assertThat(PhotoCategory.DUMP.wireValue()).isEqualTo("dump");
        assertThat(PhotoCategory.UNCATEGORIZED.wireValue()).isEqualTo("uncategorized");
    }

    @Test
    void should_expose_exactly_the_four_values_of_the_contract() {
        List<String> wireValues = Arrays.stream(PhotoCategory.values()).map(PhotoCategory::wireValue).toList();

        assertThat(wireValues).containsExactlyInAnyOrder("pics", "anime", "dump", "uncategorized");
    }

    @Test
    void should_resolve_every_contract_value_when_one_arrives_from_the_wire() {
        // The lookup the upload uses instead of Spring's enum converter, which would resolve `name()` —
        // the persistence spelling (see PhotoController).
        assertThat(PhotoCategory.fromWireValue("pics")).contains(PhotoCategory.PICS);
        assertThat(PhotoCategory.fromWireValue("anime")).contains(PhotoCategory.ANIME);
        assertThat(PhotoCategory.fromWireValue("dump")).contains(PhotoCategory.DUMP);
        assertThat(PhotoCategory.fromWireValue("uncategorized")).contains(PhotoCategory.UNCATEGORIZED);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"PICS", "Holiday", "snapshots", "uncategorised"})
    void should_resolve_nothing_when_the_value_is_not_in_the_contract(String wireValue) {
        assertThat(PhotoCategory.fromWireValue(wireValue)).isEmpty();
    }

    @Test
    void should_accept_in_the_upload_pattern_exactly_the_values_the_enum_holds() {
        // The upload is checked by ValidationConstraints.CATEGORY_PATTERN before PhotoCategory resolves it.
        // A constant added here without the pattern would be an upload the API documents and the API
        // refuses, so the two are pinned against each other.
        Pattern pattern = Pattern.compile(ValidationConstraints.CATEGORY_PATTERN);

        for (PhotoCategory category : PhotoCategory.values()) {
            assertThat(pattern.matcher(category.wireValue()).matches())
                    .as("the pattern accepts %s", category.wireValue())
                    .isTrue();
        }
        assertThat(pattern.matcher("holiday").matches()).isFalse();
        assertThat(pattern.matcher("PICS").matches()).isFalse();
    }
}
