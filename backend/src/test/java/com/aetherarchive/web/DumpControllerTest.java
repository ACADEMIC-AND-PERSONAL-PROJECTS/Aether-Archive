package com.aetherarchive.web;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.aetherarchive.config.CorsProperties;
import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.domain.ArchiveItem;
import com.aetherarchive.domain.ItemType;
import com.aetherarchive.domain.Photo;
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.repository.ArchiveItemRepository;
import com.aetherarchive.repository.PhotoRepository;
import com.aetherarchive.service.DumpService;
import com.aetherarchive.support.ArchiveFixtures;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The dump API at the HTTP boundary: the status and the exact body of every outcome the contract
 * describes ({@code /dumps} of {@code _docs/openapi.yml}).
 *
 * <p>A slice of the web layer with the archive's real {@link DumpService} behind it, so the refusals this
 * class asserts are the ones the service really raises — "six different photos, each in the archive" is
 * not expressible as an annotation, and the 400 it produces is what a client has to read. Only the two
 * repositories are mocks: the shape of the responses, the mapping of the entity and the problem details
 * are what this class is about, while {@code DumpApiFlowTest} takes the same requests through a real
 * PostgreSQL and {@code DumpQueryTest} pins the queries.
 *
 * <p>The clock is fixed, because the instant of a dump is part of the body this class asserts character
 * for character.
 *
 * <p>No transaction is involved: this slice brings no transaction manager, so the service runs unproxied
 * and the positions a publish sets are never flushed anywhere. What is asserted here is the HTTP layer —
 * status, body, problem detail — and the publish that really writes a row is covered by
 * {@code DumpApiFlowTest} (it commits) and {@code DumpPublishAtomicityTest} (it rolls back whole).
 */
@WebMvcTest(controllers = DumpController.class)
@Import({ DumpService.class, DumpControllerTest.FixedClockConfiguration.class })
@EnableConfigurationProperties({ StorageProperties.class, CorsProperties.class })
@ActiveProfiles("test")
class DumpControllerTest {

    /** The collection, spelled as the contract spells it rather than read from the controller. */
    private static final String DUMPS = "/api/v1/dumps";

    private static final Instant PUBLISHED_AT = Instant.parse("2026-10-16T09:30:45.123456Z");

    private static final String TITLE = "Septembre";

    private static final String BACKGROUND_COLOR = "#1A1A1A";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ArchiveItemRepository items;

    @MockitoBean
    private PhotoRepository photos;

    @Test
    void should_answer_201_with_the_published_dump_when_the_request_is_accepted() throws Exception {
        List<UUID> curationOrder = shuffledCurationOrder();
        given(photos.findAllById(any())).willReturn(ArchiveFixtures.unassignedDumpPhotos());
        given(items.saveAndFlush(any(ArchiveItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(TITLE, BACKGROUND_COLOR, curationOrder)))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                // The schema's five properties and nothing else: no entity, no item type.
                .andExpect(jsonPath("$.*", hasSize(5)))
                .andExpect(jsonPath("$.title").value(TITLE))
                .andExpect(jsonPath("$.backgroundColor").value(BACKGROUND_COLOR))
                .andExpect(jsonPath("$.createdAt").value(PUBLISHED_AT.toString()))
                .andExpect(jsonPath("$.photos", hasSize(ValidationConstraints.DUMP_PHOTO_COUNT)))
                // The array's order is the curation order, and no photo carries a position of its own:
                // four fields, exactly the contract's Photo schema.
                .andExpect(jsonPath("$.photos[0].*", hasSize(4)))
                .andExpect(jsonPath("$.photos[0].category").value("pics"))
                .andExpect(jsonPath("$.photos[0].url").value("/images/" + curationOrder.getFirst() + ".jpg"))
                // A matcher rather than value(list): the same matcher over the whole array, in order.
                .andExpect(jsonPath("$.photos[*].id", contains(
                        curationOrder.stream().map(UUID::toString).toArray())))
                .andExpect(jsonPath("$.photos[*].displayOrder").doesNotExist());
    }

    @Test
    void should_answer_201_with_a_null_title_when_the_request_carries_none() throws Exception {
        given(photos.findAllById(any())).willReturn(ArchiveFixtures.unassignedDumpPhotos());
        given(items.saveAndFlush(any(ArchiveItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        // ADR-011: the contract lists the title as required, and a body without one is accepted — it is a
        // superset of the bodies the schema describes, which cannot break a conforming client.
        Map<String, Object> withoutTitle = new LinkedHashMap<>();
        withoutTitle.put("backgroundColor", BACKGROUND_COLOR);
        withoutTitle.put("photoIds", ArchiveFixtures.dumpPhotoIds());

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(withoutTitle)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value(nullValue()))
                .andExpect(jsonPath("$.photos", hasSize(ValidationConstraints.DUMP_PHOTO_COUNT)));
    }

    @Test
    void should_answer_400_with_the_field_when_the_request_names_five_photos() throws Exception {
        assertRejectedForPhotoCount(ArchiveFixtures.dumpPhotoIds().subList(0, 5));
    }

    @Test
    void should_answer_400_with_the_field_when_the_request_names_seven_photos() throws Exception {
        List<UUID> seven = new ArrayList<>(ArchiveFixtures.dumpPhotoIds());
        seven.add(ArchiveFixtures.id(7));

        assertRejectedForPhotoCount(seven);
    }

    @Test
    void should_answer_400_with_the_field_when_the_same_photo_is_named_twice() throws Exception {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        List<UUID> twice = List.of(ids.get(0), ids.get(1), ids.get(2), ids.get(3), ids.get(4), ids.get(0));

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(TITLE, BACKGROUND_COLOR, twice)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.instance").value(DUMPS))
                // The archive's own rule, answered exactly as a rejected annotation is: same 400, same
                // code, same errors list, because the client's repair is the same.
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("photoIds"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value(containsString("six different photos")))
                .andExpect(jsonPath("$.errors[0].message").value(containsString(ids.get(0).toString())));
    }

    @Test
    void should_answer_400_naming_the_id_when_a_photo_is_not_in_the_archive() throws Exception {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        List<Photo> known = ArchiveFixtures.unassignedDumpPhotos();
        given(photos.findAllById(any())).willReturn(known.subList(1, known.size()));

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(TITLE, BACKGROUND_COLOR, ids)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("photoIds"))
                .andExpect(jsonPath("$.errors[0].message").value(containsString("not in the archive")))
                .andExpect(jsonPath("$.errors[0].message").value(containsString(ids.getFirst().toString())));
    }

    @Test
    void should_answer_400_with_the_field_when_the_background_color_is_not_a_hex_triple() throws Exception {
        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(TITLE, "1A1A1A", ArchiveFixtures.dumpPhotoIds())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("backgroundColor"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must match \"" + ValidationConstraints.BACKGROUND_COLOR_PATTERN + "\""));
    }

    @Test
    void should_answer_400_with_the_field_when_the_color_is_absent() throws Exception {
        Map<String, Object> withoutColour = new LinkedHashMap<>();
        withoutColour.put("title", TITLE);
        withoutColour.put("photoIds", ArchiveFixtures.dumpPhotoIds());

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(withoutColour)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("backgroundColor"))
                .andExpect(jsonPath("$.errors[0].message").value("must not be blank"));
    }

    @Test
    void should_answer_400_with_the_field_when_the_title_is_longer_than_the_limit() throws Exception {
        String tooLong = "S".repeat(ValidationConstraints.TITLE_MAX_LENGTH + 1);

        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(tooLong, BACKGROUND_COLOR, ArchiveFixtures.dumpPhotoIds())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("title"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("size must be between 0 and " + ValidationConstraints.TITLE_MAX_LENGTH));
    }

    @Test
    void should_publish_the_dumps_in_the_order_the_service_returns_them() throws Exception {
        // "Newest first" is the query's rule and is pinned against PostgreSQL in DumpQueryTest; the
        // endpoint publishes the dumps in the order it is handed them, each with its photos. Six each:
        // the read refuses a dump that does not hold six (DumpService.sixPhotosOf), so a fixture with
        // fewer would answer 500 and this class would be asserting a state the archive cannot publish.
        ArchiveItem newest = ArchiveFixtures.item(ArchiveFixtures.id(11),
                Instant.parse("2026-10-16T10:00:00Z"));
        ArchiveItem oldest = ArchiveFixtures.item(ArchiveFixtures.id(12),
                Instant.parse("2026-09-16T10:00:00Z"));
        List<Photo> photosOfNewest = curatedPhotos(newest, 21);
        List<Photo> photosOfOldest = curatedPhotos(oldest, 31);
        List<Photo> both = new ArrayList<>(photosOfNewest);
        both.addAll(photosOfOldest);
        given(items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP))
                .willReturn(List.of(newest, oldest));
        given(photos.findAllOfItemsOrderByDisplayOrder(any())).willReturn(both);

        mockMvc.perform(get(DUMPS))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(newest.getId().toString()))
                .andExpect(jsonPath("$[0].title").value("Late Summer"))
                .andExpect(jsonPath("$[0].backgroundColor").value(ArchiveFixtures.BACKGROUND_COLOR))
                .andExpect(jsonPath("$[0].createdAt").value(newest.getTimestamp().toString()))
                .andExpect(jsonPath("$[0].photos", hasSize(ValidationConstraints.DUMP_PHOTO_COUNT)))
                .andExpect(jsonPath("$[0].photos[0].id").value(photosOfNewest.getFirst().getId().toString()))
                .andExpect(jsonPath("$[0].photos[0].uploadedAt").value(ArchiveFixtures.CREATED_AT.toString()))
                .andExpect(jsonPath("$[1].id").value(oldest.getId().toString()))
                .andExpect(jsonPath("$[1].photos", hasSize(ValidationConstraints.DUMP_PHOTO_COUNT)));
    }

    @Test
    void should_answer_500_with_an_internal_failure_when_a_dump_no_longer_holds_six_photos() throws Exception {
        ArchiveItem broken = ArchiveFixtures.item(ArchiveFixtures.id(11));
        given(items.findAllByTypeOrderByTimestampDescIdDesc(ItemType.MONTHLY_DUMP))
                .willReturn(List.of(broken));
        // Five of the six: a state the schema allows — V2 bounds display_order and makes it unique per item,
        // and a delete leaves five — and the read refuses. What must never come back is a 200 with five
        // photos, or with none: such a body looks like a healthy dump to every client that reads it.
        given(photos.findAllOfItemsOrderByDisplayOrder(any()))
                .willReturn(curatedPhotos(broken, 21).subList(0, ValidationConstraints.DUMP_PHOTO_COUNT - 1));

        mockMvc.perform(get(DUMPS))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.code").value("internal-failure"))
                // The archive's one sentence for a failure of its own, and no more: the identifier of the
                // broken dump and the count it holds go to the log, where the operator needs them.
                .andExpect(jsonPath("$.detail").value("The archive could not process the request."));
    }

    /** The count is the one rule both a short and a long list break: same field, same message. */
    private void assertRejectedForPhotoCount(List<UUID> photoIds) throws Exception {
        mockMvc.perform(post(DUMPS).contentType(MediaType.APPLICATION_JSON)
                .content(body(TITLE, BACKGROUND_COLOR, photoIds)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("photoIds"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must name exactly " + ValidationConstraints.DUMP_PHOTO_COUNT + " photos"));
    }

    /** An order that is nothing like ascending, so no assertion can pass by accident on a sorted list. */
    private static List<UUID> shuffledCurationOrder() {
        List<UUID> ids = ArchiveFixtures.dumpPhotoIds();
        return List.of(ids.get(4), ids.get(0), ids.get(5), ids.get(2), ids.get(1), ids.get(3));
    }

    /** The six photos of one dump, positions 0..5, named {@code firstPhotoId} … {@code firstPhotoId+5}. */
    private static List<Photo> curatedPhotos(ArchiveItem dump, long firstPhotoId) {
        return IntStream.range(0, ValidationConstraints.DUMP_PHOTO_COUNT)
                .mapToObj(position -> ArchiveFixtures.photo(ArchiveFixtures.id(firstPhotoId + position), dump,
                        position))
                .toList();
    }

    private String body(String title, String backgroundColor, List<UUID> photoIds)
            throws JsonProcessingException {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("title", title);
        fields.put("backgroundColor", backgroundColor);
        fields.put("photoIds", photoIds);
        return objectMapper.writeValueAsString(fields);
    }

    /**
     * The archive's own clock, fixed: {@link com.aetherarchive.config.ClockConfig} is not imported by this
     * slice, so the instant every dump is stamped with is the one the assertions above name.
     */
    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {

        @Bean
        Clock clock() {
            return Clock.fixed(PUBLISHED_AT, ZoneOffset.UTC);
        }
    }
}
