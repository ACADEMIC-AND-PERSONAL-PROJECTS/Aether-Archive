package com.aetherarchive;

import static java.util.Objects.requireNonNull;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

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
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import com.aetherarchive.domain.Photo;
import com.aetherarchive.domain.PhotoCategory;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.support.ImageFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;

/**
 * The critical flow of the photo API, end to end: an upload posted to a real Tomcat, the bytes in the
 * data directory, the row in PostgreSQL, and the feed and the random pick that read it back.
 *
 * <p>{@code PhotoControllerTest} pins the shape of every response on a mocked database, and
 * {@code MultipartUploadCeilingTest} proves the same upload path at the container's ceilings. This class
 * proves what only all three layers together can: that the photo the client is told about, the file on
 * disk and the row in the database are the same photo — the upload is stored once, and the {@code url} it
 * answers with names a file that is really there.
 *
 * <p>The archive writes into this class's own directory under the system temp dir, so no assertion here
 * depends on, or touches, a developer's {@code AETHER_DATA_DIR}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(PostgresTestConfiguration.class)
class PhotoApiFlowTest {

    /** The collection, spelled as the contract spells it. */
    private static final String PHOTOS = "/api/v1/photos";

    /** Assigned before the context refreshes; this class's own data directory. */
    private static Path dataDir;

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) throws IOException {
        dataDir = Files.createTempDirectory("aether-archive-e1-s6-flow-");
        registry.add("aether.storage.data-dir", dataDir::toString);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private PhotoRepository photos;

    @Test
    void should_store_the_upload_on_disk_and_in_the_database_when_it_is_posted() throws IOException {
        ResponseEntity<PhotoResponse> response = upload("pics", MediaType.IMAGE_PNG, ImageFixtures.png());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        PhotoResponse created = requireNonNull(response.getBody(), "the 201 carries a photo");

        // The bytes, under the name the response publishes: a UUID the archive generated, in the images
        // directory, byte for byte what the client sent.
        Path stored = dataDir.resolve(created.url().substring(1));
        assertThat(stored).hasParent(dataDir.resolve("images"));
        assertThat(stored.getFileName().toString()).isEqualTo(created.id() + ".png");
        assertThat(Files.readAllBytes(stored)).isEqualTo(ImageFixtures.png());

        // The row the feed reads: the same identifier, the file's relative path, and nothing curated yet —
        // an upload is unassigned until a story assigns it (ADR-011).
        Photo row = photos.findById(created.id()).orElseThrow();
        assertThat(row.getLocalFilePath()).isEqualTo("images/" + created.id() + ".png");
        assertThat(row.getCategory()).isEqualTo(PhotoCategory.PICS);
        assertThat(row.getArchiveItem()).isNull();
        assertThat(row.getDisplayOrder()).isNull();
        assertThat(row.getCreatedAt()).isEqualTo(created.uploadedAt());
    }

    @Test
    void should_list_the_upload_in_the_feed_when_the_archive_is_asked() {
        PhotoResponse created = requireNonNull(
                upload("anime", MediaType.IMAGE_JPEG, ImageFixtures.jpeg()).getBody());

        ResponseEntity<List<PhotoResponse>> response = restTemplate.exchange(PHOTOS, HttpMethod.GET, null,
                new ParameterizedTypeReference<>() {
                });

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        List<PhotoResponse> feed = requireNonNull(response.getBody());

        // The photo is in the feed, described exactly as the upload described it — the same record, which
        // is four fields and no part of the entity (this is what reading it back into a DTO proves).
        assertThat(feed).contains(created);
        int mine = feed.indexOf(created);
        assertThat(feed.get(mine).url()).isEqualTo(created.url());
        assertThat(feed.get(mine).uploadedAt()).isEqualTo(created.uploadedAt());
        // Newest first: whatever other tests left in this container's archive, the instants never rise.
        List<Instant> stamps = feed.stream().map(PhotoResponse::uploadedAt).toList();
        assertThat(stamps).isSortedAccordingTo(Comparator.reverseOrder());
    }

    @Test
    void should_pick_a_photo_that_really_is_in_the_archive_when_one_is_asked_at_random() {
        upload("dump", MediaType.IMAGE_GIF, ImageFixtures.gif());

        ResponseEntity<PhotoResponse> response = restTemplate.getForEntity(PHOTOS + "/random",
                PhotoResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        PhotoResponse picked = requireNonNull(response.getBody());
        // Which photo `order by random()` picks is the database's business; that it names one the archive
        // really holds is this test's.
        Photo row = photos.findById(picked.id()).orElseThrow();
        assertThat(picked.url()).isEqualTo("/" + row.getLocalFilePath());
        assertThat(picked.uploadedAt()).isEqualTo(row.getCreatedAt());
    }

    @Test
    void should_answer_400_when_the_category_is_posted_as_a_file() {
        MultiValueMap<String, Object> parts = form();
        addFile(parts, "file", "holiday.png", MediaType.IMAGE_PNG, ImageFixtures.png());
        // The shape `curl -F "category=@values.txt"` posts: the field arrives as a file part, which the
        // endpoint cannot read as the string it declares. The client's mistake has to be answered as one.
        addFile(parts, "category", "category.txt", MediaType.TEXT_PLAIN,
                "pics".getBytes(StandardCharsets.US_ASCII));

        ResponseEntity<Map<String, Object>> response = post(parts);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody()).containsEntry("code", "invalid-parameter");
        // The sentence of the conversion refusal, not the one a value of the wrong format gets: the field
        // is named and the shape it should have been sent in is given, and the file's content is not echoed.
        assertThat((String) response.getBody().get("detail"))
                .contains("'category'")
                .contains("cannot be read from the request");
    }

    @Test
    void should_answer_400_with_the_field_when_the_category_is_not_a_contract_value() {
        MultiValueMap<String, Object> parts = form();
        addFile(parts, "file", "holiday.png", MediaType.IMAGE_PNG, ImageFixtures.png());
        parts.add("category", "holiday");

        ResponseEntity<Map<String, Object>> response = post(parts);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody()).containsEntry("code", "validation-failure");
        assertThat(response.getBody().get("errors").toString()).contains("category");
    }

    private ResponseEntity<PhotoResponse> upload(String category, MediaType contentType, byte[] payload) {
        MultiValueMap<String, Object> parts = form();
        addFile(parts, "file", "holiday.png", contentType, payload);
        parts.add("category", category);

        return restTemplate.exchange(PHOTOS, HttpMethod.POST, multipart(parts), PhotoResponse.class);
    }

    private ResponseEntity<Map<String, Object>> post(MultiValueMap<String, Object> parts) {
        return restTemplate.exchange(PHOTOS, HttpMethod.POST, multipart(parts),
                new ParameterizedTypeReference<>() {
                });
    }

    private static MultiValueMap<String, Object> form() {
        return new LinkedMultiValueMap<>();
    }

    /**
     * Adds a part the container treats as a <em>file</em>: a resource carries a file name, a plain string
     * does not, and that is the difference the {@code category} tests above depend on.
     */
    private static void addFile(MultiValueMap<String, Object> parts, String name, String filename,
            MediaType contentType, byte[] payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(contentType);
        parts.add(name, new HttpEntity<>(named(filename, payload), headers));
    }

    private static HttpEntity<MultiValueMap<String, Object>> multipart(MultiValueMap<String, Object> parts) {
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
}
