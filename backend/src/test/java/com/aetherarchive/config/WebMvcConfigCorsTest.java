package com.aetherarchive.config;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * CORS behaviour of {@link WebMvcConfig}, exercised against a probe controller: no real controller
 * exists yet (first one lands with E1-S6).
 */
@WebMvcTest(controllers = WebMvcConfigCorsTest.ProbeController.class)
@Import(WebMvcConfig.class)
@EnableConfigurationProperties({ CorsProperties.class, StorageProperties.class })
class WebMvcConfigCorsTest {

    @Nested
    @TestPropertySource(properties = "aether.cors.allowed-origins=http://localhost:5173,http://192.168.*.*:5173")
    class WithConfiguredOrigins {

        @Autowired
        private MockMvc mockMvc;

        @Test
        void should_allow_origin_when_it_is_configured() throws Exception {
            mockMvc.perform(get("/test/cors-probe").header("Origin", "http://localhost:5173"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
        }

        @Test
        void should_allow_origin_when_it_matches_a_wildcard_pattern() throws Exception {
            mockMvc.perform(get("/test/cors-probe").header("Origin", "http://192.168.1.42:5173"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", "http://192.168.1.42:5173"));
        }

        @Test
        void should_answer_preflight_when_the_origin_is_configured() throws Exception {
            // The path the Vite frontend actually uses: it sends a non-simple request on every call
            // with a JSON body, so the browser preflights it first.
            mockMvc.perform(options("/test/cors-probe")
                            .header("Origin", "http://localhost:5173")
                            .header("Access-Control-Request-Method", "POST")
                            .header("Access-Control-Request-Headers", "content-type"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                    .andExpect(header().string("Access-Control-Allow-Methods", containsString("POST")))
                    .andExpect(header().string("Access-Control-Allow-Headers", containsString("content-type")));
        }

        @Test
        void should_reject_origin_when_it_is_not_configured() throws Exception {
            // Spring 6 rejects a disallowed origin outright (403 "Invalid CORS request") and never
            // echoes it back; the browser then fails the call instead of reading the response.
            mockMvc.perform(get("/test/cors-probe").header("Origin", "http://evil.example:5173"))
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }

    @Nested
    @TestPropertySource(properties = "aether.cors.allowed-origins=")
    class WithoutConfiguredOrigins {

        @Autowired
        private MockMvc mockMvc;

        @Test
        void should_not_allow_any_origin_when_none_is_configured() throws Exception {
            mockMvc.perform(get("/test/cors-probe").header("Origin", "http://localhost:5173"))
                    .andExpect(status().isOk())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }

    @RestController
    static class ProbeController {

        @GetMapping("/test/cors-probe")
        String probe() {
            return "ok";
        }
    }
}
