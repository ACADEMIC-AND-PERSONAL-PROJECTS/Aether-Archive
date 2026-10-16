package com.aetherarchive;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.service.ImageFormat;
import com.aetherarchive.service.StorageInitializer;
import com.aetherarchive.service.StorageService;
import com.aetherarchive.service.StoredFile;
import com.aetherarchive.support.ImageFixtures;
import com.aetherarchive.support.PostgresTestConfiguration;
import com.aetherarchive.support.TempDataDirectory;

/**
 * The static image path, end to end (E1-S5): a file written by {@link StorageService} is fetched over a
 * real Tomcat and answered with its bytes, the media type of its stored extension and the two headers
 * that make it safe to render, while a file that is not there, a directory and every path that tries to
 * leave the images directory are refused without revealing anything about the disk.
 *
 * <p><strong>What only this layer can show.</strong> The bytes a real upload wrote are the bytes a
 * browser gets, under the name {@code Photo.url} publishes; the container is the one the frontend will
 * talk to, so the answers here include its own (the 400 it raises before the archive sees an encoded
 * slash or a null byte, and the path it never normalises); and the headers are the ones a browser acts
 * on, not the ones a unit test would have to assume.
 *
 * <p><strong>Two clients, for two different questions.</strong> The ordinary requests go through
 * {@link TestRestTemplate}, as the rest of the suite does. The hostile ones go through the JDK's
 * {@link HttpClient}, because a refusal is only the server's if the path arrived as it was written, and
 * the framework's client does not carry it that way: asked for {@code /images/%2e%2e%2fcanary.txt} it was
 * answered 404 — the archive, refusing a decoded path — where the same string sent unchanged is answered
 * 400 by the container, before the archive is reached at all.
 *
 * <p>Everything is this class's own: a data directory under the system temp dir, so a developer's
 * {@code AETHER_DATA_DIR} is untouched, and a database of its own.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestPropertySource(properties = "aether.test.database=image_serving")
@Import(PostgresTestConfiguration.class)
class ImageServingFlowTest {

    /** The URL space of the stored originals, as the contract spells it. */
    private static final String IMAGES = "/images";

    /** The response header the audit's SEC-N2 asks for: a browser must not second-guess the media type. */
    private static final String NOSNIFF = "X-Content-Type-Options";

    /** A file inside the data directory but outside {@code images/}: what no response may ever return. */
    private static final String CANARY_NAME = "canary-outside-images.txt";

    private static final String CANARY = "AETHER-CANARY-NOTHING-OUTSIDE-IMAGES-MAY-BE-SERVED";

    /**
     * The three directives of the answer a stored image gets: the file is public, it is the same file for
     * a year, and a client may stop asking. Spelled as Spring writes them, {@code max-age} first; the
     * acceptance criterion names the same three directives in another order, which a client does not see.
     */
    private static final String ONE_YEAR_CACHE = "max-age=31536000, public, immutable";

    /**
     * Every extension the upload path may store, with the media type its response must carry. Spelled
     * here rather than derived, because this is the second half of a cross-check: the test below proves
     * that this map covers the upload whitelist exactly, so a format the archive learns to store cannot
     * be served under a type nobody decided.
     */
    private static final Map<String, MediaType> SERVED_MEDIA_TYPES = Map.of(
            "jpg", MediaType.IMAGE_JPEG,
            "jpeg", MediaType.IMAGE_JPEG,
            "png", MediaType.IMAGE_PNG,
            "gif", MediaType.IMAGE_GIF,
            "webp", MediaType.parseMediaType("image/webp"),
            "avif", MediaType.parseMediaType("image/avif"));

    private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();

    /** Assigned before the context refreshes; this class's own data directory. */
    private static Path dataDir;

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) throws IOException {
        dataDir = TempDataDirectory.create("aether-archive-e1-s5-flow-");
        registry.add("aether.storage.data-dir", dataDir::toString);
    }

    /**
     * The canary goes down before each test, not in a {@code @BeforeAll}: the data directory does not
     * exist yet when the class-level callbacks run — the context, and the {@code @DynamicPropertySource}
     * that creates it here, are started when the test instance is — and writing it is idempotent.
     */
    @BeforeEach
    void writeTheCanary() throws IOException {
        Files.writeString(dataDir.resolve(CANARY_NAME), CANARY);
    }

    @AfterAll
    static void removeDataDirectory() throws IOException {
        TempDataDirectory.remove(dataDir);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private StorageService storage;

    @LocalServerPort
    private int port;

    @Test
    void should_serve_the_stored_file_with_its_cache_and_nosniff_headers_when_its_url_is_fetched() {
        StoredFile stored = storage.store(upload("holiday.png", "image/png", ImageFixtures.png()));

        ResponseEntity<byte[]> response = restTemplate.getForEntity("/" + stored.relativePath(), byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The bytes the storage service wrote, byte for byte, under the name it published.
        assertThat(response.getBody()).isEqualTo(ImageFixtures.png());
        assertThat(response.getHeaders().getContentLength()).isEqualTo(ImageFixtures.png().length);
        // The media type comes from the stored name, never from a client's request.
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
        // A UUID name never changes, so the answer is worth keeping: one request per image, ever.
        assertThat(response.getHeaders().getCacheControl()).isEqualTo(ONE_YEAR_CACHE);
        assertThat(response.getHeaders().getFirst(NOSNIFF)).isEqualTo("nosniff");
    }

    @Test
    void should_answer_404_without_naming_a_path_when_no_file_is_stored_under_the_url() {
        String url = IMAGES + "/" + UUID.randomUUID() + ".png";

        ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(response.getBody()).contains("\"code\":\"not-found\"");
        // The refusal names the request and nothing of the disk: no data directory, no file: URL.
        assertThat(response.getBody()).doesNotContain(dataDir.toString(), "file:");
        // The header travels with the path, so a refusal carries it too — and the refusal itself is not
        // handed out for a year the way a stored file is.
        assertThat(response.getHeaders().getFirst(NOSNIFF)).isEqualTo("nosniff");
        assertThat(response.getHeaders().getCacheControl()).isNull();
    }

    @Test
    void should_serve_every_extension_of_the_upload_whitelist_with_its_image_media_type() throws IOException {
        // Serving is measured against the whitelist of the upload path itself: a format added to
        // ImageFormat fails here until its media type has been decided, and one removed leaves a key that
        // no longer matches. No second list of what the archive accepts is kept.
        assertThat(SERVED_MEDIA_TYPES)
                .containsOnlyKeys(ImageFormat.acceptedExtensions().toArray(String[]::new));

        for (Map.Entry<String, MediaType> served : SERVED_MEDIA_TYPES.entrySet()) {
            String name = UUID.randomUUID() + "." + served.getKey();
            Files.writeString(imagesDirectory().resolve(name), "bytes of a stored image");

            ResponseEntity<byte[]> response = restTemplate.getForEntity(IMAGES + "/" + name, byte[].class);

            assertThat(response.getStatusCode()).as("the status of a stored .%s", served.getKey())
                    .isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType()).as("the media type of a stored .%s",
                    served.getKey()).isEqualTo(served.getValue());
        }
    }

    @Test
    void should_serve_a_file_of_an_extension_the_archive_never_writes_with_the_platforms_media_type()
            throws IOException {
        // What a name outside the whitelist gets was one of the questions E1-S5 had to answer. The
        // archive's own writer cannot produce such a file — it stores the canonical extension of the
        // sniffed format and nothing else — so this is the framework's answer for a file dropped into
        // images/ by hand, pinned so that it is a decision rather than a surprise: the media type of the
        // platform's table (here the IANA entry for .xyz), never a type the archive invented, and never
        // octet-stream by accident. See the README's "Serving images" for what that means for a name like
        // .html, which no upload can reach.
        String name = UUID.randomUUID() + ".xyz";
        Files.writeString(imagesDirectory().resolve(name), "not an image the archive stored");

        ResponseEntity<byte[]> response = restTemplate.getForEntity(IMAGES + "/" + name, byte[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).hasToString("chemical/x-xyz");
    }

    @ParameterizedTest(name = "{0} answers 404")
    @ValueSource(strings = {IMAGES, IMAGES + "/", IMAGES + "//", IMAGES + "/nested", IMAGES + "/nested/"})
    void should_answer_404_when_a_directory_is_requested_instead_of_a_file(String path) throws Exception {
        StoredFile stored = storage.store(upload("holiday.png", "image/png", ImageFixtures.png()));
        Files.createDirectories(imagesDirectory().resolve("nested"));
        Files.writeString(imagesDirectory().resolve("nested").resolve(stored.id() + ".png"), "nested bytes");

        HttpResponse<String> response = rawGet(path);

        // Never a listing, with or without the trailing slash: the images directory is a directory of
        // files a client names, not one it browses.
        assertThat(response.statusCode()).as("the status of %s", path).isEqualTo(404);
        assertThat(response.body()).as("the answer to %s", path)
                .doesNotContain(stored.id().toString(), dataDir.toString());
    }

    /**
     * The canary by its own name, reached the plain way — the one request that asks what the location list
     * contains. A climbing path never asks it: the framework refuses {@code ../} before any location is
     * consulted, so a second location added beside {@code images/} would answer this request and leave the
     * whole refusal battery green. Measured: with the data directory added as a second location, every
     * other test in this class still passed and this URL returned the canary.
     */
    @Test
    void should_not_serve_a_file_that_sits_beside_the_images_directory() throws Exception {
        assertThat(dataDir.resolve(CANARY_NAME)).as("the canary is readable").hasContent(CANARY);

        HttpResponse<String> response = rawGet(IMAGES + "/" + CANARY_NAME);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).as("the answer to the canary's own URL")
                .doesNotContain(CANARY, dataDir.toString());
    }

    @ParameterizedTest(name = "{0} answers {1}")
    @MethodSource("climbingPaths")
    void should_refuse_a_path_that_climbs_out_of_the_images_directory(String path, int expectedStatus)
            throws Exception {
        // The canary is the whole point of the request: if it is not readable, an escape would answer
        // 404 exactly like a refusal, and this test would prove nothing.
        assertThat(dataDir.resolve(CANARY_NAME)).as("the canary is readable").hasContent(CANARY);

        HttpResponse<String> response = rawGet(path);

        // Two layers answer, and both refuse: 400 is the container rejecting a path it will not normalise
        // (an encoded slash or backslash, a null byte) before the archive is reached at all, and 404 is
        // the archive refusing a path that reached it. Neither is a served file.
        assertThat(response.statusCode()).as("the status of %s", path).isEqualTo(expectedStatus);
        // The canary is inside the data directory but outside images/, and /etc/passwd is outside the
        // archive entirely: no answer may carry the contents of either, nor the path of the data
        // directory itself.
        assertThat(response.body()).as("the answer to %s", path)
                .doesNotContain(CANARY, "root:x:", dataDir.toString());
    }

    @Test
    void should_refuse_a_climbing_path_even_when_the_file_it_names_is_stored() throws Exception {
        StoredFile stored = storage.store(upload("holiday.png", "image/png", ImageFixtures.png()));
        String name = stored.id() + "." + stored.extension();

        // The file itself is reachable, so the two refusals below are about the path and nothing else:
        // each of them would name a stored file if a `..` were tidied up before the lookup, and each is
        // therefore also the proof that the client sent the path as it was written.
        assertThat(restTemplate.getForEntity("/" + stored.relativePath(), byte[].class).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        assertThat(rawGet(IMAGES + "/../images/" + name).statusCode()).isEqualTo(404);
        assertThat(rawGet(IMAGES + "/nested/../" + name).statusCode()).isEqualTo(404);
    }

    /**
     * The climbing paths and the status each one is answered with, measured against the running server.
     * The canary and {@code /etc/passwd} are the two things every one of them tries to reach.
     */
    static Stream<Arguments> climbingPaths() {
        return Stream.of(
                // Plain dot segments: refused by the archive, which sees the path as written.
                Arguments.of(IMAGES + "/../" + CANARY_NAME, 404),
                Arguments.of(IMAGES + "/nested/../../" + CANARY_NAME, 404),
                Arguments.of(IMAGES + "/....//" + CANARY_NAME, 404),
                Arguments.of(IMAGES + "/..;/" + CANARY_NAME, 404),
                Arguments.of(IMAGES + "//etc/passwd", 404),
                Arguments.of(IMAGES + "/%2e%2e/" + CANARY_NAME, 404),
                // Encoded once: still decoded before routing, so the archive refuses it too.
                Arguments.of(IMAGES + "/%2e%2e%2f" + CANARY_NAME, 400),
                Arguments.of(IMAGES + "/%2E%2E%2F" + CANARY_NAME, 400),
                Arguments.of(IMAGES + "/..%2f" + CANARY_NAME, 400),
                Arguments.of(IMAGES + "/..%5c..%5c" + CANARY_NAME, 400),
                Arguments.of(IMAGES + "/%2fetc%2fpasswd", 400),
                // A null byte is a path the container refuses outright.
                Arguments.of(IMAGES + "/%00.png", 400),
                // Encoded twice: the first decode leaves an encoded segment, which the archive refuses.
                Arguments.of(IMAGES + "/%252e%252e%252f" + CANARY_NAME, 404),
                Arguments.of(IMAGES + "/%252e%252e%252f%252e%252e%252fetc%252fpasswd", 404),
                // Climbing above the application root: refused by the container.
                Arguments.of(IMAGES + "/../../etc/passwd", 400),
                Arguments.of(IMAGES + "/../../../etc/passwd", 400));
    }

    /**
     * A GET whose path reaches the server exactly as written. The JDK's client sends the URI's raw path
     * and does not tidy dot segments away, which is what makes the refusals above about the server's
     * behaviour rather than about the test client's.
     */
    private HttpResponse<String> rawGet(String rawPath) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + rawPath))
                .GET()
                .build();
        return HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private static Path imagesDirectory() {
        return dataDir.resolve(StorageInitializer.IMAGES_DIR);
    }

    private static MultipartFile upload(String clientName, String mediaType, byte[] payload) {
        return new MockMultipartFile("file", clientName, mediaType, payload);
    }
}
