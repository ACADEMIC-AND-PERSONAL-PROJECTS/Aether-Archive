package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class AetherArchiveApplicationTests {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void should_load_application_context_when_started() {
        assertThat(applicationContext.getBean(AetherArchiveApplication.class)).isNotNull();
    }
}
