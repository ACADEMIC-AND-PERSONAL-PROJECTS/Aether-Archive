package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
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
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.support.ImageFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;
import com.aetherarchive.support.TempDataDirectory;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The dump flow end to end, on the three layers it really crosses: the six photos are uploaded to a real
 * Tomcat, stored in this class's own data directory and written to PostgreSQL; the dump is published by a
 * second HTTP request; and the published compilation is read back by a third, where what comes out has to
 * be what went in — the same six photos, in the order the publishing request named them.
 *
 * <p>This is the story's acceptance criterion no slice test can cover. {@code DumpControllerTest} pins the
 * shape of every response against mocked repositories, {@code DumpQueryTest} pins the statements the read
 * path issues, and {@code DumpServiceTest} pins the rules — all three of them could pass while the dump a
 * client publishes and the dump a client reads back are not the same one. The order is the point: six
 * photos are uploaded in one order and published in another, chosen so that neither the upload order, nor
 * an identifier sort, nor any other coincidental order can reproduce it.
 *
 * <p>Both halves of the exchange are read from the wire rather than through the archive's own records: the
 * request bodies are {@link Map}s and the responses are parsed as {@link JsonNode}, so a field renamed on
 * one side of the API surfaces here as a failure instead of round-tripping silently.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(PostgresTestConfiguration.class)
class DumpApiFlowTest {

    /** The two collections, spelled as the contract spells them. */
    private static final String PHOTOS = "/api/v1/photos";

    private static final String DUMPS = "/api/v1/dumps";

    private static final String TITLE = "Octobre";

    private static final String BACKGROUND_COLOR = "#2E4A62";

    /**
     * The order the six photos of a dump are named in, as indices into their upload order: the photo
     * uploaded second is published first, the one uploaded fifth is published last. Nothing about it is
     * sorted — not by upload, not by identifier — which is what makes the read-back assertions mean
     * something.
     */
    private static final List<Integer> SHUFFLED_INDICES = List.of(1, 4, 0, 5, 2, 3);

    /**
     * The order {@code GET /dumps} promises, written in the test as its own statement of the rule: the
     * stamp descending, and the identifier descending when two dumps share one.
     */
    private static final Comparator<JsonNode> NEWEST_FIRST =
            Comparator.comparing((JsonNode dump) -> Instant.parse(dump.path("createdAt").asText()))
                    .thenComparing(dump -> UUID.fromString(dump.path("id").asText()))
                    .reversed();

    /** Assigned before the context refreshes; this class's own data directory. */
    private static Path dataDir;

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) throws IOException {
        dataDir = TempDataDirectory.create("aether-archive-e1-s7-dump-flow-");
        registry.add("aether.storage.data-dir", dataDir::toString);
    }

    @AfterAll
    static void removeDataDirectory() throws IOException {
        // The uploaded images go with the directory the class wrote them into, so a run leaves nothing of
        // this class behind.
        TempDataDirectory.remove(dataDir);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PhotoRepository photos;

    @Test
    void should_publish_two_dumps_and_read_them_back_newest_first_when_the_photos_were_named_out_of_order()
            throws Exception {
        List<UUID> firstUploads = uploadSixPhotos();
        List<UUID> firstOrder = shuffled(firstUploads);
        JsonNode firstCreated = publish(TITLE, BACKGROUND_COLOR, firstOrder);

        List<UUID> secondUploads = uploadSixPhotos();
        List<UUID> secondOrder = shuffled(secondUploads);
        JsonNode secondCreated = publish(null, BACKGROUND_COLOR, secondOrder);

        // The 201 of each publish: the dump that was created, its photos in the order the request named
        // them, and nothing of the entity — five fields on the dump and four on a photo. No displayOrder
        // is published: the array's position is the order (ADR-011 §3), so a client that reads it cannot
        // see a field the contract does not describe.
        assertPublished(firstCreated, TITLE, BACKGROUND_COLOR, firstOrder);
        assertPublished(secondCreated, null, BACKGROUND_COLOR, secondOrder);

        ResponseEntity<String> response = restTemplate.getForEntity(DUMPS, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        List<JsonNode> listed = elementsOf(readTree(response.getBody()), DUMPS);
        List<JsonNode> published = List.of(firstCreated, secondCreated);

        // Newest first, by the rule the contract states: the whole response is ordered by the instant
        // descending, the id descending on an equal stamp. The two dumps this test published are then
        // filtered out of it and expected in exactly that order — computed from the instants their 201s
        // published, so the assertion pins the rule rather than how far apart two HTTP requests really
        // were. A third dump another test left in this container disturbs neither statement.
        assertThat(listed).isSortedAccordingTo(NEWEST_FIRST);
        assertThat(Instant.parse(firstCreated.path("createdAt").asText()))
                .isBeforeOrEqualTo(Instant.parse(secondCreated.path("createdAt").asText()));
        List<UUID> expected = newestFirst(published);
        assertThat(idsOf(listed)).filteredOn(expected::contains).containsExactlyElementsOf(expected);

        for (JsonNode created : published) {
            JsonNode dump = found(listed, UUID.fromString(created.path("id").asText()));

            // Read back exactly as it was published: the same stamp, the same title, the same aura, and the
            // same six photos in the same order — this is the criterion the story is about.
            assertThat(dump.path("createdAt").asText()).isEqualTo(created.path("createdAt").asText());
            assertThat(dump.path("title").asText()).isEqualTo(created.path("title").asText());
            assertThat(dump.path("backgroundColor").asText()).isEqualTo(BACKGROUND_COLOR);
            assertThat(idsOf(photosOf(dump))).containsExactlyElementsOf(idsOf(photosOf(created)));

            for (JsonNode photo : photosOf(dump)) {
                assertThat(photo.path("url").asText())
                        .isEqualTo("/images/" + photo.path("id").asText() + ".png");
                Path stored = dataDir.resolve(photo.path("url").asText().substring(1));
                assertThat(stored).isRegularFile();
                assertThat(Files.readAllBytes(stored)).isEqualTo(ImageFixtures.png());
            }

            // The rows behind the response carry the order as positions 0..5, in the order the request
            // named the photos: the contract's array is the projection of this column, not a coincidence.
            List<Photo> rows = photos.findAllByArchiveItemIdOrderByDisplayOrderAsc(dump.path("id")
                    .asText()
                    .transform(UUID::fromString));
            assertThat(rows).extracting(Photo::getId).containsExactlyElementsOf(idsOf(photosOf(created)));
            assertThat(rows).extracting(Photo::getDisplayOrder)
                    .containsExactly(0, 1, 2, 3, 4, 5);
        }
    }

    @Test
    void should_refuse_a_photo_of_another_dump_when_it_is_published_again() throws Exception {
        List<UUID> curated = shuffled(uploadSixPhotos());
        JsonNode dump = publish(TITLE, BACKGROUND_COLOR, curated);

        // Five fresh uploads and one photo that already belongs to the dump above: a publish that moves
        // the photo would empty the dump it came from, so the whole request is refused.
        List<UUID> fresh = uploadSixPhotos();
        List<UUID> taken = new ArrayList<>(fresh.subList(0, ValidationConstraints.DUMP_PHOTO_COUNT - 1));
        UUID alreadyCurated = curated.get(2);
        taken.add(alreadyCurated);

        ResponseEntity<String> response = postDump(TITLE, BACKGROUND_COLOR, taken);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        JsonNode problem = readTree(response.getBody());
        assertThat(problem.path("status").asInt()).isEqualTo(400);
        assertThat(problem.path("title").asText()).isEqualTo("Validation failed");
        assertThat(problem.path("instance").asText()).isEqualTo(DUMPS);
        assertThat(problem.path("code").asText()).isEqualTo("validation-failure");
        assertThat(problem.path("errors").get(0).path("field").asText()).isEqualTo("photoIds");
        assertThat(problem.path("errors").get(0).path("message").asText())
                .contains("already belongs to another item")
                .contains(alreadyCurated.toString());

        // And the refusal changed nothing: the photo is still position 2 of the dump it was already in.
        ResponseEntity<String> listed = restTemplate.getForEntity(DUMPS, String.class);
        JsonNode untouched = found(elementsOf(readTree(listed.getBody()), DUMPS),
                UUID.fromString(dump.path("id").asText()));
        assertThat(idsOf(photosOf(untouched))).containsExactlyElementsOf(curated);
    }

    /** The body of one published dump, asserting the 201 and the shape shared by every publish. */
    private void assertPublished(JsonNode created, String title, String backgroundColor,
            List<UUID> requestedOrder) {
        assertThat(created.size()).isEqualTo(5);
        assertThat(created.path("title").isNull()).isEqualTo(title == null);
        if (title != null) {
            assertThat(created.path("title").asText()).isEqualTo(title);
        }
        assertThat(created.path("backgroundColor").asText()).isEqualTo(backgroundColor);
        assertThat(created.path("photos").size()).isEqualTo(ValidationConstraints.DUMP_PHOTO_COUNT);
        assertThat(idsOf(photosOf(created))).containsExactlyElementsOf(requestedOrder);
        assertThat(created.path("photos").get(0).size()).isEqualTo(4);
        assertThat(created.path("photos").get(0).has("displayOrder")).isFalse();
    }

    /** Publishes a dump over HTTP and returns its 201 body. */
    private JsonNode publish(String title, String backgroundColor, List<UUID> photoIds)
            throws JsonProcessingException {
        ResponseEntity<String> response = postDump(title, backgroundColor, photoIds);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        return readTree(response.getBody());
    }

    /**
     * The request the contract describes, built here as a map rather than from the archive's own record:
     * a field the API stops reading would then make this test fail instead of passing on both sides.
     */
    private ResponseEntity<String> postDump(String title, String backgroundColor, List<UUID> photoIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("backgroundColor", backgroundColor);
        body.put("photoIds", photoIds.stream().map(UUID::toString).toList());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(DUMPS, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
    }

    /** Six real PNG uploads through the photo API, in the order they were posted. */
    private List<UUID> uploadSixPhotos() throws JsonProcessingException {
        List<UUID> uploaded = new ArrayList<>();
        for (int index = 0; index < ValidationConstraints.DUMP_PHOTO_COUNT; index++) {
            MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            parts.add("file", new HttpEntity<>(
                    named("holiday.png", ImageFixtures.png()), headers));
            parts.add("category", "dump");
            HttpHeaders requestHeaders = new HttpHeaders();
            requestHeaders.setContentType(MediaType.MULTIPART_FORM_DATA);

            ResponseEntity<String> response = restTemplate.exchange(PHOTOS, HttpMethod.POST,
                    new HttpEntity<>(parts, requestHeaders), String.class);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            uploaded.add(UUID.fromString(readTree(response.getBody()).path("id").asText()));
        }
        return uploaded;
    }

    /** The upload order rearranged by {@link #SHUFFLED_INDICES}: what a publish is asked to display. */
    private static List<UUID> shuffled(List<UUID> uploaded) {
        return SHUFFLED_INDICES.stream().map(uploaded::get).toList();
    }

    /** The six photos of a dump node, in the order the array publishes them. */
    private static JsonNode photosOf(JsonNode dump) {
        return dump.path("photos");
    }

    /** The {@code id} of every node of an array — a photos array or the list of dumps alike. */
    private static List<UUID> idsOf(Iterable<JsonNode> nodes) {
        List<UUID> ids = new ArrayList<>();
        nodes.forEach(node -> ids.add(UUID.fromString(node.path("id").asText())));
        return ids;
    }

    /** One dump of a list response, found by identifier: the list is the archive's, not this test's. */
    private static JsonNode found(List<JsonNode> dumps, UUID id) {
        return dumps.stream()
                .filter(dump -> dump.path("id").asText().equals(id.toString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no dump " + id + " in the response"));
    }

    /** The expected order of a list response: the newest first, the id descending on an equal stamp. */
    private static List<UUID> newestFirst(List<JsonNode> published) {
        return published.stream()
                .sorted(NEWEST_FIRST)
                .map(dump -> UUID.fromString(dump.path("id").asText()))
                .toList();
    }

    /** The elements of a JSON array, with the path named when the body is not one. */
    private static List<JsonNode> elementsOf(JsonNode body, String path) {
        if (!body.isArray()) {
            throw new AssertionError(path + " answered " + body);
        }
        List<JsonNode> elements = new ArrayList<>();
        body.forEach(elements::add);
        return elements;
    }

    private JsonNode readTree(String body) throws JsonProcessingException {
        return objectMapper.readTree(body);
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
