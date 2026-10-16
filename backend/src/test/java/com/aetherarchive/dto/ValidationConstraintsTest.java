package com.aetherarchive.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The values of {@link ValidationConstraints} are the API contract's limits, and the tests that prove
 * them build their payloads <em>from</em> the constants — so a wrong literal would keep every other test
 * green. Each one is therefore pinned against the number or pattern the specs write.
 */
class ValidationConstraintsTest {

    @Test
    void should_fix_the_title_limit_at_eighty_characters() {
        assertThat(ValidationConstraints.TITLE_MAX_LENGTH).isEqualTo(80);
    }

    @Test
    void should_fix_the_background_colour_pattern_at_rrggbb() {
        assertThat(ValidationConstraints.BACKGROUND_COLOR_PATTERN).isEqualTo("^#[0-9a-fA-F]{6}$");
    }

    @Test
    void should_fix_the_dump_at_six_photos() {
        assertThat(ValidationConstraints.DUMP_PHOTO_COUNT).isEqualTo(6);
    }

    @Test
    void should_fix_the_category_pattern_at_the_contracts_four_values() {
        assertThat(ValidationConstraints.CATEGORY_PATTERN).isEqualTo("^(pics|anime|dump|uncategorized)$");
    }
}
