package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.service.StorageInitializer;
import com.aetherarchive.service.StorageService;
import com.aetherarchive.service.StoredFile;
import com.aetherarchive.support.ImageFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The upload ceiling at the HTTP boundary, through the real container: a request that carries a file
 * <em>at</em> the configured limit reaches the service and is stored, and one that carries more is
 * refused by the container with a 413.
 *
 * <p>This is the regression test for the bug a review measured: with the request ceiling equal to the
 * file ceiling, the multipart envelope (boundaries, part headers, the {@code category} field) pushed a
 * file at the limit over the request ceiling, and the container answered 413 before
 * {@link StorageService} saw the bytes. It is an integration test on purpose — {@code MockMvc} does not
 * parse multipart at all, so only a real Tomcat can catch it.
 *
 * <p>It stores no row — the upload probe goes through the storage service and never reaches the photo
 * repository — and names its own database all the same: a context that boots one has to say which it
 * takes, so that two of them sharing a schema is always something a reader can see
 * ({@code PostgresTestConfiguration}).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=upload_ceiling")
@Import({ PostgresTestConfiguration.class, MultipartUploadCeilingTest.UploadProbeConfiguration.class })
class MultipartUploadCeilingTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private StorageProperties storageProperties;

    @Test
    void should_store_an_upload_of_exactly_the_limit_when_it_arrives_through_the_container()
            throws IOException {
        Path dataDir = storageProperties.dataDir();
        long maxFileBytes = maxFileBytes();

        ResponseEntity<Map<String, Object>> response = upload(
                ImageFixtures.padded(ImageFixtures.png(), (int) maxFileBytes));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Path stored = dataDir.resolve((String) response.getBody().get("path"));
        assertThat(stored).hasParent(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        assertThat(Files.size(stored)).isEqualTo(maxFileBytes);
        // The test owns the file it stored: the data directory is the shared test one, not a developer's.
        Files.delete(stored);
    }

    @Test
    void should_refuse_an_upload_one_byte_over_the_limit_when_it_arrives_through_the_container()
            throws IOException {
        Path dataDir = storageProperties.dataDir();
        List<Path> storedBefore = imagesOf(dataDir);

        ResponseEntity<Map<String, Object>> response = upload(
                ImageFixtures.padded(ImageFixtures.png(), (int) maxFileBytes() + 1));

        // The container's own file ceiling, one byte over: the archive refuses it before the service.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        // And the refusal is the API's own problem detail, through the real container: the same code the
        // service's own refusal carries, not the container's error page. A client that switches on the
        // code cannot tell which of the two ceilings caught it.
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody()).containsEntry("code", "upload-too-large");
        assertThat(imagesOf(dataDir)).isEqualTo(storedBefore);
    }

    @Test
    void should_refuse_a_request_that_exceeds_the_request_ceiling() throws IOException {
        Path dataDir = storageProperties.dataDir();
        List<Path> storedBefore = imagesOf(dataDir);

        // The file ceiling plus the whole envelope headroom and a byte: no request may hide a larger
        // upload behind multipart framing, and it is refused before a byte is written.
        ResponseEntity<Map<String, Object>> response = upload(ImageFixtures.padded(ImageFixtures.png(),
                (int) (maxFileBytes() + 1024L * 1024L) + 1));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody()).containsEntry("code", "upload-too-large");
        assertThat(imagesOf(dataDir)).isEqualTo(storedBefore);
    }

    private long maxFileBytes() {
        return storageProperties.maxUploadMb() * 1024L * 1024L;
    }

    /**
     * Posts the same shape {@code POST /api/v1/photos} takes: a {@code file} part with a real filename —
     * without one the container treats the part as a form field — and the {@code category} field whose
     * headers, with the boundaries, make up the envelope in question.
     */
    private ResponseEntity<Map<String, Object>> upload(byte[] payload) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.IMAGE_PNG);
        body.add("file", new HttpEntity<>(named(payload), partHeaders));
        body.add("category", "pics");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        return restTemplate.exchange("/test/uploads", HttpMethod.POST,
                new HttpEntity<>(body, headers), new ParameterizedTypeReference<>() {
                });
    }

    private static Resource named(byte[] payload) {
        return new ByteArrayResource(payload) {
            @Override
            public String getFilename() {
                return "holiday.png";
            }
        };
    }

    private static List<Path> imagesOf(Path dataDir) throws IOException {
        try (Stream<Path> entries = Files.list(dataDir.resolve(StorageInitializer.IMAGES_DIR))) {
            return entries.toList();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class UploadProbeConfiguration {

        @Bean
        UploadProbeController uploadProbeController(StorageService storageService) {
            return new UploadProbeController(storageService);
        }
    }

    /**
     * Test-only: not an endpoint of the API. It carries a real multipart request through Tomcat into the
     * real {@link StorageService} and answers the stored path, which the photo endpoint does not publish —
     * the container's ceilings are what this class measures, not the endpoint.
     */
    @RestController
    static class UploadProbeController {

        private final StorageService storageService;

        UploadProbeController(StorageService storageService) {
            this.storageService = storageService;
        }

        @PostMapping(path = "/test/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        Map<String, String> upload(@RequestParam("file") MultipartFile file,
                @RequestParam("category") String category) {
            StoredFile stored = storageService.store(file);
            return Map.of("category", category, "path", stored.relativePath());
        }
    }
}
