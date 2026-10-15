package com.aetherarchive.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.aetherarchive.config.CorsProperties;
import com.aetherarchive.config.StorageProperties;
import com.aetherarchive.dto.ValidationConstraints;

/**
 * The error contract of the API, one mapped case at a time: the status, the {@code code}, the title, the
 * fields a validation failure rejected, and the rule that none of them carry anything internal.
 *
 * <p>A probe controller throws each exception the advice maps, because the endpoints that will throw them
 * for real arrive with E1-S6 and E1-S7. This is a {@code @WebMvcTest}: the web layer only, no database and
 * no data directory, with a size limit pinned to a value the defaults never produce — the 413 messages
 * have to quote the configured limit, not a copy of it.
 */
// The probe is registered explicitly: the scan behind @WebMvcTest does not pick up a controller nested
// in the test class, and a mapping that is silently absent would make every request below answer 404.
@WebMvcTest(controllers = ApiExceptionHandlerTest.ProbeController.class)
@Import({ ApiExceptionHandlerTest.ProbeController.class, ApiExceptionHandlerTest.PhotoCountGuard.class })
@EnableConfigurationProperties({ StorageProperties.class, CorsProperties.class })
@TestPropertySource(properties = {
        "aether.storage.max-upload-mb=" + ApiExceptionHandlerTest.CONFIGURED_LIMIT_MB,
        "aether.storage.data-dir=${java.io.tmpdir}/aether-archive-e1-s8-test-data" })
class ApiExceptionHandlerTest {

    static final int CONFIGURED_LIMIT_MB = 7;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void should_answer_415_with_the_unsupported_image_type_code() throws Exception {
        mockMvc.perform(get("/test/errors/unsupported-image"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.code").value("unsupported-image-type"))
                .andExpect(jsonPath("$.title").value("Unsupported image type"))
                .andExpect(jsonPath("$.detail").value(containsString("not a recognised image")))
                .andExpect(jsonPath("$.instance").value("/test/errors/unsupported-image"))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_413_with_the_upload_too_large_code_when_the_service_refuses() throws Exception {
        mockMvc.perform(get("/test/errors/upload-too-large"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.status").value(413))
                .andExpect(jsonPath("$.code").value("upload-too-large"))
                .andExpect(jsonPath("$.title").value("Upload too large"))
                .andExpect(jsonPath("$.detail").value(containsString(CONFIGURED_LIMIT_MB + " MB")))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_413_with_the_same_code_and_title_when_the_container_refuses_the_request()
            throws Exception {
        // The service's refusal, thrown while the bytes are copied.
        mockMvc.perform(get("/test/errors/upload-too-large"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("upload-too-large"))
                .andExpect(jsonPath("$.title").value("Upload too large"));

        // The container's refusal: the request is over the multipart ceiling, so StorageService never sees
        // a byte of it and cannot be the one that reports it. A client must not be able to tell them apart.
        mockMvc.perform(get("/test/errors/container-ceiling"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("upload-too-large"))
                .andExpect(jsonPath("$.title").value("Upload too large"))
                .andExpect(jsonPath("$.detail").value(containsString(CONFIGURED_LIMIT_MB + " MB")))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_500_with_a_path_free_storage_failure() throws Exception {
        // The probe's cause names a file under a home directory: the client gets the sentence the storage
        // layer wrote for it, never the cause.
        mockMvc.perform(get("/test/errors/storage"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.code").value("storage-failure"))
                .andExpect(jsonPath("$.title").value("Storage failure"))
                .andExpect(jsonPath("$.detail").value(containsString("could not be written to the data directory")))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_with_every_rejected_field() throws Exception {
        String body = """
                {"title": "%s", "backgroundColor": "1A1A1A", "photoIds": [
                  "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002",
                  "00000000-0000-0000-0000-000000000003", "00000000-0000-0000-0000-000000000004",
                  "00000000-0000-0000-0000-000000000005", "00000000-0000-0000-0000-000000000006"]}
                """.formatted("x".repeat(ValidationConstraints.TITLE_MAX_LENGTH + 1));

        // The six ids are valid, so exactly two fields fail: the title is one character over and the colour
        // lost its '#'. A collection that reported one field, or the rejected values, fails here.
        mockMvc.perform(post("/test/errors/dump").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.length()").value(2))
                .andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("title", "backgroundColor")))
                .andExpect(jsonPath("$.errors[?(@.field == 'title')].message",
                        contains("size must be between 0 and " + ValidationConstraints.TITLE_MAX_LENGTH)))
                .andExpect(jsonPath("$.errors[?(@.field == 'backgroundColor')].message",
                        contains("must match \"" + ValidationConstraints.BACKGROUND_COLOR_PATTERN + "\"")))
                .andExpect(jsonPath("$.errors[*].message", containsInAnyOrder(
                        containsString("size must be between"), containsString("must match"))))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_a_request_parameter_fails_its_constraint() throws Exception {
        // A constrained handler parameter: Spring MVC validates it itself and refuses the request before
        // the method body runs. The field is named after the parameter, which only that path knows — the
        // method-validation proxy below would name the service's parameter instead.
        mockMvc.perform(get("/test/errors/constrained-param").param("page", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].field").value("page"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must be greater than or equal to " + ValidationConstraints.DUMP_PHOTO_COUNT))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_the_archive_itself_refuses_an_argument() throws Exception {
        // The same rule raised outside the web layer: a @Validated bean called with an argument that
        // violates it throws ConstraintViolationException from Spring's method-validation proxy. The
        // handler method has no constrained parameter of its own, so MVC's validation cannot be what
        // answers here, and the field it reports is the service's parameter.
        mockMvc.perform(get("/test/errors/constrained-service").param("count", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].field").value("requestedCount"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must be greater than or equal to " + ValidationConstraints.DUMP_PHOTO_COUNT))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_list_at_most_ten_rejected_fields() throws Exception {
        // A body that is wrong in a dozen places still answers in one screen: the collection is bounded,
        // so neither a hostile nor a broken client can make an error response as large as it likes.
        String body = "{\"tags\": [" + "\"\",".repeat(11) + "\"\"]}";

        mockMvc.perform(post("/test/errors/wide").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.errors.length()").value(10))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_the_body_is_not_json() throws Exception {
        mockMvc.perform(post("/test/errors/dump").contentType(MediaType.APPLICATION_JSON).content("{\"title\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("malformed-request"))
                .andExpect(jsonPath("$.title").value("Malformed request"))
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_a_required_multipart_part_is_missing() throws Exception {
        mockMvc.perform(multipart("/test/errors/upload"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("missing-request-part"))
                .andExpect(jsonPath("$.title").value("Missing request part"))
                .andExpect(jsonPath("$.detail").value(containsString("'file'")))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_404_when_nothing_serves_the_path() throws Exception {
        mockMvc.perform(get("/test/errors/nothing-here"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("not-found"))
                .andExpect(jsonPath("$.title").value("Not found"))
                .andExpect(jsonPath("$.instance").value("/test/errors/nothing-here"))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_500_without_leaking_the_bug() throws Exception {
        // The probe's message looks like a database error on purpose: whatever it says, the body may not
        // repeat it — a stack trace, a query and a class name all live in the log instead.
        mockMvc.perform(get("/test/errors/unexpected"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.code").value("internal-failure"))
                .andExpect(jsonPath("$.title").value("Internal error"))
                .andExpect(jsonPath("$.detail").value("The archive could not process the request."))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_keep_the_status_spring_refused_the_request_with() throws Exception {
        // A POST-only probe reached with GET: the refusal must stay a 405 carrying the verb that works,
        // not become a 500 that reports the client's mistake as a server failure.
        mockMvc.perform(get("/test/errors/dump"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string("Allow", containsString("POST")))
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.code").value("method-not-allowed"))
                .andExpect(jsonPath("$.title").value("Method Not Allowed"))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_keep_a_status_that_has_no_standard_name() throws Exception {
        // HttpStatusCode is an interface, so a refusal can carry a status no enum names: it is still
        // answered as a problem detail, with the generic code, rather than turned into a 500.
        mockMvc.perform(get("/test/errors/nameless-status"))
                .andExpect(status().is(599))
                .andExpect(jsonPath("$.code").value("request-rejected"))
                .andExpect(jsonPath("$.title").value("Request rejected"))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_log_the_exception_behind_a_500() throws Exception {
        Logger handlerLogger = (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        handlerLogger.addAppender(appender);
        try {
            mockMvc.perform(get("/test/errors/unexpected")).andExpect(status().isInternalServerError());
        }
        finally {
            handlerLogger.detachAppender(appender);
        }

        // The operator debugs a 500 from the log, which is why the body can stay silent about it.
        assertThat(appender.list).anySatisfy(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getThrowableProxy()).isNotNull();
            assertThat(event.getThrowableProxy().getClassName())
                    .isEqualTo(IllegalStateException.class.getName());
        });
    }

    /**
     * The rule that holds for every mapped case ({@code .claude/rules/security.md}): the body carries a
     * status, a code, a title, a sentence and field names — never a stack trace, a SQL fragment, a file
     * path or a class name. It is asserted from the raw body, so a detail that starts leaking one fails
     * here rather than in a review.
     */
    private static ResultMatcher noInternalDetail() {
        return result -> assertThat(result.getResponse().getContentAsString())
                .as("response body must carry no internal detail")
                .doesNotContain("Exception", "at com.", "at org.", "at java.", "java.", ".java:",
                        "org.springframework", "com.aetherarchive", "jdbc:", "SELECT", "select *",
                        "/home/", "/tmp/", "/etc/", "C:\\");
    }

    /**
     * Test-only: the requests the advice has to answer. They throw the exceptions the real endpoints will
     * throw, from a controller, so MockMvc exercises the whole mapping — handler, advice, serialiser.
     */
    @RestController
    static class ProbeController {

        private final PhotoCountGuard photoCountGuard;

        ProbeController(PhotoCountGuard photoCountGuard) {
            this.photoCountGuard = photoCountGuard;
        }

        @GetMapping("/test/errors/unsupported-image")
        void unsupportedImage() {
            throw new UnsupportedImageTypeException("the content of the upload is not a recognised image; "
                    + "the archive accepts JPEG, PNG, GIF, WEBP and AVIF");
        }

        @GetMapping("/test/errors/upload-too-large")
        void uploadTooLarge() {
            throw new UploadTooLargeException("the upload exceeds the maximum size of "
                    + CONFIGURED_LIMIT_MB + " MB (AETHER_MAX_UPLOAD_MB)");
        }

        @GetMapping("/test/errors/container-ceiling")
        void containerCeiling() {
            throw new MaxUploadSizeExceededException(CONFIGURED_LIMIT_MB * 1024L * 1024L);
        }

        @GetMapping("/test/errors/storage")
        void storage() {
            throw new StorageException("the upload could not be written to the data directory; check that "
                    + "this process may write to AETHER_DATA_DIR and that the disk has free space",
                    new IOException("no space left on device: "
                            + "/home/curator/AetherArchive_Data/images/6f1c9e42.png"));
        }

        @GetMapping("/test/errors/unexpected")
        void unexpected() {
            throw new IllegalStateException("no row for select * from photo where id = ?");
        }

        @GetMapping("/test/errors/nameless-status")
        void namelessStatus() {
            throw new ResponseStatusException(HttpStatusCode.valueOf(599));
        }

        @PostMapping(path = "/test/errors/dump", consumes = MediaType.APPLICATION_JSON_VALUE)
        void dump(@Valid @RequestBody DumpRequest body) {
            // Nothing to do: the mapping is what is under test, and a valid body simply passes validation.
        }

        @PostMapping(path = "/test/errors/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        void upload(@RequestPart("file") MultipartFile file) {
            // Same: reaching the method means the multipart request carried the part.
        }

        @PostMapping(path = "/test/errors/wide", consumes = MediaType.APPLICATION_JSON_VALUE)
        void wide(@Valid @RequestBody WideRequest body) {
            // Same, for the request that fails in more places than the collection may list.
        }

        @GetMapping("/test/errors/constrained-param")
        String constrainedParam(@RequestParam("page") @Min(ValidationConstraints.DUMP_PHOTO_COUNT) int page) {
            return Integer.toString(page);
        }

        @GetMapping("/test/errors/constrained-service")
        String constrainedService(@RequestParam("count") int count) {
            return Integer.toString(photoCountGuard.photosPerDump(count));
        }
    }

    /**
     * Test-only: the archive enforcing its own rule away from the web layer — a {@code @Validated} bean
     * whose arguments Spring's method-validation proxy checks, so a violation arrives as a
     * {@link jakarta.validation.ConstraintViolationException} rather than through MVC's handler-parameter
     * validation. The two are separate mapped cases because the two exceptions are separate types.
     */
    @Validated
    static class PhotoCountGuard {

        int photosPerDump(@Min(ValidationConstraints.DUMP_PHOTO_COUNT) int requestedCount) {
            return requestedCount;
        }
    }

    /**
     * Test-only: the request E1-S7 posts, with its limits taken from
     * {@link ValidationConstraints} rather than restated, so a test and a DTO cannot drift apart.
     */
    record DumpRequest(
            @Size(max = ValidationConstraints.TITLE_MAX_LENGTH) String title,
            @Pattern(regexp = ValidationConstraints.BACKGROUND_COLOR_PATTERN) String backgroundColor,
            @Size(min = ValidationConstraints.DUMP_PHOTO_COUNT, max = ValidationConstraints.DUMP_PHOTO_COUNT)
                    List<UUID> photoIds) {
    }

    /** Test-only: a body whose fields are all wrong at once, for the bound on the {@code errors} list. */
    record WideRequest(List<@NotBlank String> tags) {
    }
}
