package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.service.StorageInitializer;
import com.aetherarchive.support.ImageFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;
import com.aetherarchive.support.TempDataDirectory;

/**
 * The compensation of an upload whose row cannot be saved, against a real database: the bytes reach the
 * disk, PostgreSQL refuses the insert, and neither the image nor a staging leftover stays behind.
 *
 * <p>{@code PhotoServiceTest} proves the same rule with a mocked repository, which can only say that the
 * service reacts to a {@code RuntimeException}; this class proves it against the failure itself — the real
 * Tomcat, real Flyway, real data directory, and an insert the database really refuses. That is the case an
 * orphan image would be left by.
 *
 * <p>It owns its context because of {@code spring.flyway.locations}: this class adds a test-only folder of
 * migrations whose single file makes every insert into {@code photo} fail. That file lives in
 * {@code src/test/resources/db/test-migration} and is on no classpath the application runs from, so the
 * production schema is untouched — the assertions of every other test in the suite run against the schema
 * the archive ships.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestPropertySource(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/test-migration")
@Import(PostgresTestConfiguration.class)
class PhotoUploadCompensationTest {

    /** The collection, spelled as the contract spells it. */
    private static final String PHOTOS = "/api/v1/photos";

    /** Assigned before the context refreshes; this class's own data directory. */
    private static Path dataDir;

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) throws IOException {
        dataDir = TempDataDirectory.create("aether-archive-e1-s6-refused-");
        registry.add("aether.storage.data-dir", dataDir::toString);
    }

    @AfterAll
    static void removeDataDirectory() throws IOException {
        TempDataDirectory.remove(dataDir);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private PhotoRepository photos;

    @Test
    void should_remove_the_stored_bytes_when_the_database_refuses_the_row() throws IOException {
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(PHOTOS, HttpMethod.POST,
                upload("pics"), new ParameterizedTypeReference<>() {
                });

        // The request was well formed and the image acceptable, so this refusal is the archive's, not the
        // client's; the body says nothing about the SQL behind it. The code says how far the upload got: a
        // failure of the storage layer answers `storage-failure`, so `internal-failure` means the bytes were
        // written and the row was refused — which is exactly the state the compensation has to clear.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody()).isEqualTo(Map.of(
                "type", "about:blank",
                "title", "Internal error",
                "status", 500,
                "detail", "The archive could not process the request.",
                "instance", PHOTOS,
                "code", "internal-failure"));

        // Nothing of the upload is left: an image no response describes and no API can reach is a file the
        // owner would have to find and delete by hand, and the staging directory is emptied by the store
        // itself, before the row is ever attempted.
        assertThat(entriesOf(StorageInitializer.IMAGES_DIR)).isEmpty();
        assertThat(entriesOf(StorageInitializer.TMP_DIR)).isEmpty();
        assertThat(photos.count()).isZero();
    }

    /**
     * A multipart form as the endpoint takes it: the {@code file} part as a resource with a file name —
     * without one the container treats the part as a form field — and the {@code category} field.
     * {@code MultipartBodyBuilder} would build the same body in fewer lines, but it reads a reactive type
     * the servlet stack does not have on its classpath.
     */
    private static HttpEntity<MultiValueMap<String, Object>> upload(String category) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.IMAGE_PNG);
        parts.add("file", new HttpEntity<>(named("holiday.png", ImageFixtures.png()), fileHeaders));
        parts.add("category", category);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return new HttpEntity<>(parts, headers);
    }

    private static Resource named(String filename, byte[] payload) {
        return new ByteArrayResource(payload) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private static List<Path> entriesOf(String directory) throws IOException {
        try (Stream<Path> entries = Files.list(dataDir.resolve(directory))) {
            return entries.toList();
        }
    }
}
