package com.aetherarchive.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.aetherarchive.config.CorsProperties;
import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.repository.PhotoRepository;
import com.jayway.jsonpath.JsonPath;
import com.aetherarchive.service.PhotoService;
import com.aetherarchive.service.StorageInitializer;
import com.aetherarchive.service.StorageService;
import com.aetherarchive.support.ArchiveFixtures;
import com.aetherarchive.support.ImageFixtures;

/**
 * The photo API at the HTTP boundary: the status and the exact body of every outcome the contract
 * describes ({@code /photos}, {@code /photos/random} of {@code _docs/openapi.yml}).
 *
 * <p>A slice of the web layer, with the archive's real upload path behind it — {@link StorageService} and
 * {@link PhotoService} are the beans the application uses, and their data directory is a throwaway one, so
 * "the upload is not an image" and "the upload is over the limit" are answered by the code that really
 * decides them rather than by a stub told which exception to throw. Only the database is mocked: the shape
 * of the response, the refusals and the mapping are what this class is about, while {@code PhotoApiFlowTest}
 * takes the same requests through a real PostgreSQL.
 *
 * <p>The clock is fixed, because the instant of an upload is part of the body this class asserts
 * character for character.
 */
@WebMvcTest(controllers = PhotoController.class)
@Import({ PhotoService.class, StorageService.class, StorageInitializer.class,
        PhotoControllerTest.FixedClockConfiguration.class })
@EnableConfigurationProperties({ StorageProperties.class, CorsProperties.class })
@ActiveProfiles("test")
class PhotoControllerTest {

    /** The path of the collection, spelled as the contract spells it rather than read from the controller. */
    private static final String PHOTOS = "/api/v1/photos";

    private static final Instant UPLOADED_AT = Instant.parse("2026-10-15T09:30:45.123456Z");

    /** Assigned before the context refreshes; the slice's own data directory, never the developer's. */
    private static Path dataDir;

    @DynamicPropertySource
    static void dataDirectory(DynamicPropertyRegistry registry) throws IOException {
        dataDir = Files.createTempDirectory("aether-archive-e1-s6-web-");
        registry.add("aether.storage.data-dir", dataDir::toString);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StorageProperties storageProperties;

    @MockitoBean
    private PhotoRepository photos;

    @Test
    void should_answer_201_with_the_photo_it_stored_when_an_upload_is_accepted() throws Exception {
        given(photos.saveAndFlush(any(Photo.class))).willAnswer(invocation -> invocation.getArgument(0));

        String body = mockMvc.perform(multipart(PHOTOS)
                .file(upload("holiday.png", MediaType.IMAGE_PNG_VALUE, ImageFixtures.png()))
                .param("category", "pics"))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                // The schema's four properties and nothing else: no entity, no display order, no path on
                // disk. A fifth field would mean an entity leaked into the response.
                .andExpect(jsonPath("$.*", hasSize(4)))
                .andExpect(jsonPath("$.category").value("pics"))
                .andExpect(jsonPath("$.uploadedAt").value("2026-10-15T09:30:45.123456Z"))
                .andExpect(jsonPath("$.url").value(matchesPattern("^/images/[0-9a-f-]{36}\\.png$")))
                .andReturn().getResponse().getContentAsString();

        // The url is not decoration: it names the file the bytes really landed in, under a name the
        // archive generated — the client's "holiday.png" is nowhere on disk.
        Path stored = dataDir.resolve(urlOf(body).substring(1));
        assertThat(stored).hasParent(dataDir.resolve(StorageInitializer.IMAGES_DIR));
        assertThat(stored.getFileName().toString()).endsWith(".png").doesNotContain("holiday");
        assertThat(Files.readAllBytes(stored)).isEqualTo(ImageFixtures.png());
    }

    @Test
    void should_answer_400_when_the_request_carries_no_file() throws Exception {
        mockMvc.perform(multipart(PHOTOS).param("category", "pics"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("missing-request-part"))
                .andExpect(jsonPath("$.title").value("Missing request part"))
                .andExpect(jsonPath("$.detail").value(containsString("'file'")));
    }

    @Test
    void should_answer_400_with_the_field_when_the_category_is_absent() throws Exception {
        // The contract requires the field; a request without it is refused as a rejected field, so the
        // client reads which one is missing rather than a generic refusal it has to guess at.
        mockMvc.perform(multipart(PHOTOS)
                .file(upload("holiday.png", MediaType.IMAGE_PNG_VALUE, ImageFixtures.png())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("category"))
                .andExpect(jsonPath("$.errors[0].message").value(containsString("must not be blank")));
    }

    @Test
    void should_answer_400_with_the_field_when_the_category_is_not_a_contract_value() throws Exception {
        mockMvc.perform(multipart(PHOTOS)
                .file(upload("holiday.png", MediaType.IMAGE_PNG_VALUE, ImageFixtures.png()))
                .param("category", "holiday"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("category"))
                // The accepted values are the ones the contract lists, quoted from the constraint that
                // rejects the others.
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must match \"" + ValidationConstraints.CATEGORY_PATTERN + "\""));
    }

    @Test
    void should_answer_415_when_the_upload_is_not_an_image() throws Exception {
        // Bytes that are text, declared as a PNG: the archive reads the bytes, not the label.
        mockMvc.perform(multipart(PHOTOS)
                .file(upload("holiday.png", MediaType.IMAGE_PNG_VALUE, ImageFixtures.text()))
                .param("category", "pics"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.code").value("unsupported-image-type"))
                .andExpect(jsonPath("$.title").value("Unsupported image type"))
                .andExpect(jsonPath("$.detail").value(containsString("not a recognised image")));
    }

    @Test
    void should_answer_413_when_the_upload_is_over_the_configured_limit() throws Exception {
        long fileLimitBytes = storageProperties.maxUploadMb() * 1024L * 1024L;

        mockMvc.perform(multipart(PHOTOS)
                .file(upload("holiday.png", MediaType.IMAGE_PNG_VALUE,
                        ImageFixtures.padded(ImageFixtures.png(), (int) fileLimitBytes + 1)))
                .param("category", "pics"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.status").value(413))
                .andExpect(jsonPath("$.code").value("upload-too-large"))
                .andExpect(jsonPath("$.title").value("Upload too large"))
                .andExpect(jsonPath("$.detail")
                        .value(containsString(storageProperties.maxUploadMb() + " MB")));
    }

    @Test
    void should_publish_the_feed_in_the_order_the_database_returns_it() throws Exception {
        // "Newest first" is the query's rule and is pinned against PostgreSQL in PhotoRepositoryTest; the
        // endpoint publishes the rows in the order it is handed them.
        Photo newest = ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(2));
        Photo oldest = ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(1));
        given(photos.findAllByOrderByCreatedAtDescIdDesc()).willReturn(List.of(newest, oldest));

        mockMvc.perform(get(PHOTOS))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(newest.getId().toString()))
                .andExpect(jsonPath("$[0].url").value("/images/" + newest.getId() + ".jpg"))
                .andExpect(jsonPath("$[0].category").value("pics"))
                .andExpect(jsonPath("$[0].uploadedAt").value(ArchiveFixtures.CREATED_AT.toString()))
                .andExpect(jsonPath("$[0].*", hasSize(4)))
                .andExpect(jsonPath("$[1].id").value(oldest.getId().toString()));
    }

    @Test
    void should_publish_one_photo_when_the_random_endpoint_is_asked() throws Exception {
        Photo photo = ArchiveFixtures.unassignedPhoto(ArchiveFixtures.id(3));
        given(photos.findRandom()).willReturn(Optional.of(photo));

        mockMvc.perform(get(PHOTOS + "/random"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(photo.getId().toString()))
                .andExpect(jsonPath("$.url").value("/images/" + photo.getId() + ".jpg"))
                .andExpect(jsonPath("$.category").value("pics"))
                .andExpect(jsonPath("$.uploadedAt").value(ArchiveFixtures.CREATED_AT.toString()))
                .andExpect(jsonPath("$.*", hasSize(4)));
    }

    @Test
    void should_answer_404_with_the_empty_archive_code_when_the_random_endpoint_finds_none() throws Exception {
        given(photos.findRandom()).willReturn(Optional.empty());

        // The frontend shows its empty state for this code. A 500 would be a crash screen for a state the
        // archive is simply in, and a bare 404 would be indistinguishable from a path that does not exist.
        mockMvc.perform(get(PHOTOS + "/random"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("empty-archive"))
                .andExpect(jsonPath("$.detail").value(containsString("No photo has been archived yet")))
                .andExpect(jsonPath("$.instance").value(PHOTOS + "/random"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    /** The {@code url} of a photo response, as the client reads it. */
    private static String urlOf(String json) {
        return JsonPath.read(json, "$.url");
    }

    private static MockMultipartFile upload(String clientName, String mediaType, byte[] content) {
        return new MockMultipartFile("file", clientName, mediaType, content);
    }

    /**
     * The archive's own clock, fixed: {@link com.aetherarchive.config.ClockConfig} is not imported by this
     * slice, so the instant every upload is stamped with is the one the assertions above name.
     */
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {

        @Bean
        Clock clock() {
            return Clock.fixed(UPLOADED_AT, ZoneOffset.UTC);
        }
    }
}
