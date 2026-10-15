package com.aetherarchive.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

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
}
