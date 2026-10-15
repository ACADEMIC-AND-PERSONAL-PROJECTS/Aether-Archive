package com.aetherarchive.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Method;
import java.util.List;
import java.util.UUID;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
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
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.validation.annotation.Validated;
import org.springframework.validation.method.MethodValidationException;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
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
                // The two values the request was rejected for are client input: the body names the
                // fields and the constraints, never what was sent.
                .andExpect(noEchoedValue("x".repeat(ValidationConstraints.TITLE_MAX_LENGTH + 1), "1A1A1A"))
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
    void should_answer_400_when_method_validation_refuses_a_call() throws Exception {
        // The same rule again, carried by the other exception the method-validation machinery throws:
        // Spring's own validator refuses the call with this one, and Spring MVC answers 400 for it — the
        // advice must not report a refused call of the archive's as a 500.
        mockMvc.perform(get("/test/errors/method-validation"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.length()").value(1))
                // The parameter carries no discovered name here, so the advice names it by position: the
                // fallback a real handler parameter only hits when its name was not compiled in.
                .andExpect(jsonPath("$.errors[0].field").value("parameter[0]"))
                .andExpect(jsonPath("$.errors[0].message")
                        .value("must be greater than or equal to " + ValidationConstraints.DUMP_PHOTO_COUNT))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_a_path_variable_does_not_have_the_expected_format() throws Exception {
        // A typo in a UUID path variable. Spring MVC answers 400 for it, so the advice must too: a 500
        // would send the frontend down its server-error path and turn a mistyped link into a broken
        // archive. The rejected value is client input and is not echoed.
        mockMvc.perform(get("/test/errors/photo/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("invalid-parameter"))
                .andExpect(jsonPath("$.title").value("Invalid parameter"))
                .andExpect(jsonPath("$.detail").value(containsString("'id'")))
                // The value a path variable failed to parse is part of the path, so it is in `instance` —
                // that is the URI the client asked for. The prose is where it must never be repeated.
                .andExpect(jsonPath("$.detail", not(containsString("not-a-uuid"))))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_400_when_a_request_parameter_does_not_have_the_expected_format() throws Exception {
        // The same client mistake through a query parameter, which reaches the advice by a different
        // argument resolver: both must answer alike, and so must the enum and integer parameters of the
        // endpoints E1-S6/S7 add.
        mockMvc.perform(get("/test/errors/photos").param("page", "not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("invalid-parameter"))
                .andExpect(jsonPath("$.title").value("Invalid parameter"))
                .andExpect(jsonPath("$.detail").value(containsString("'page'")))
                .andExpect(noEchoedValue("not-a-number"))
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
    void should_report_a_class_level_violation_against_the_request() throws Exception {
        // A constraint on the object itself — the shape E1-S7's "six *different* photo ids" will take —
        // names no field to report. It is answered as the request's own failure rather than dropped, so
        // the collection the detail promises is never empty.
        String body = """
                {"photoIds": ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000001",
                  "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003",
                  "00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"]}
                """;

        mockMvc.perform(post("/test/errors/distinct-dump").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation-failure"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].field").value("request"))
                .andExpect(jsonPath("$.errors[0].message").value("the six photo ids must be different"))
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
    void should_answer_400_when_a_multipart_request_cannot_be_read_as_one() throws Exception {
        // A request that declares itself multipart and is not one — a broken envelope, a part header the
        // container refuses. That is the client's mistake: Spring answers 400 for it, and the advice must
        // not turn it into an archive failure.
        mockMvc.perform(get("/test/errors/unreadable-multipart"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("malformed-request"))
                .andExpect(jsonPath("$.title").value("Malformed request"))
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
    void should_keep_the_sentence_the_archive_wrote_for_its_own_refusal() throws Exception {
        // The refusal comes from the archive, after a controller saw the request, so the problem detail
        // it raised is the answer. "No photo has that id" and "that URL is not one of mine" are different
        // states to the client, and the frontend shows a different screen for each.
        mockMvc.perform(get("/test/errors/missing-photo"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("not-found"))
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.detail").value("No photo with that id exists in the archive."))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_keep_the_code_a_refusing_body_set_of_its_own() throws Exception {
        // A story that needs its own code for a state of the archive — an empty one, for instance — sets
        // it on the problem detail it refuses with. Replacing it with the status-derived code would take
        // that distinction away from the client.
        mockMvc.perform(get("/test/errors/empty-archive"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("empty-archive"))
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.detail").value("No photo has been archived yet."))
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
    void should_answer_400_when_a_required_parameter_is_missing() throws Exception {
        // The status-derived family, pinned: a required parameter the client did not send. Spring MVC
        // raises it as a refusal, and the code is the status name rather than a code of the archive's own.
        mockMvc.perform(get("/test/errors/photos"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("bad-request"))
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(noInternalDetail());
    }

    @Test
    void should_answer_415_when_the_body_is_not_in_a_content_type_the_endpoint_takes() throws Exception {
        mockMvc.perform(post("/test/errors/dump").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.code").value("unsupported-media-type"))
                .andExpect(jsonPath("$.title").value("Unsupported Media Type"))
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
     *
     * <p>The tokens are the shapes a leak takes in practice, not only the ones an exception message
     * happens to have today: a stack frame in any project's package, a JDK or framework class, a SQL
     * fragment in either case, a path under any of the directories a path could start with, and a class
     * of this application by name.
     */
    private static ResultMatcher noInternalDetail() {
        return result -> assertThat(result.getResponse().getContentAsString())
                .as("response body must carry no internal detail")
                .doesNotContain("Exception", "at com.", "at org.", "at java.", "java.", ".java:",
                        "org.springframework", "com.aetherarchive", "jakarta.", "hibernate", "jdbc:",
                        "SELECT", "select ", "insert into", "update ", "delete from", "from photo",
                        "/home/", "/tmp/", "/etc/", "/var/", "/opt/", "C:\\",
                        "DumpRequest", "PhotoIdsRequest", "WideRequest", "ProbeController");
    }

    /**
     * A response that was rejected for what it carried may not repeat it: the values are arbitrary client
     * input, and a body is copied into logs, tickets and screenshots.
     */
    private static ResultMatcher noEchoedValue(String... rejectedValues) {
        return result -> assertThat(result.getResponse().getContentAsString())
                .as("response body must not echo a rejected value")
                .doesNotContain(rejectedValues);
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

        @GetMapping("/test/errors/method-validation")
        void methodValidation() throws NoSuchMethodException {
            throw methodValidationException();
        }

        @GetMapping("/test/errors/photo/{id}")
        String photo(@PathVariable UUID id) {
            return id.toString();
        }

        @GetMapping("/test/errors/photos")
        String photos(@RequestParam("page") int page) {
            return Integer.toString(page);
        }

        @GetMapping("/test/errors/unreadable-multipart")
        void unreadableMultipart() {
            throw new MultipartException("Failed to parse multipart servlet request");
        }

        @GetMapping("/test/errors/missing-photo")
        void missingPhoto() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No photo with that id exists in the archive.");
        }

        @GetMapping("/test/errors/empty-archive")
        void emptyArchive() {
            ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,
                    "No photo has been archived yet.");
            body.setProperty("code", "empty-archive");
            throw new ErrorResponseException(HttpStatus.NOT_FOUND, body, null);
        }

        @PostMapping(path = "/test/errors/distinct-dump", consumes = MediaType.APPLICATION_JSON_VALUE)
        void distinctDump(@Valid @RequestBody PhotoIdsRequest body) {
            // Same: reaching the method means the rule on the object itself accepted the ids.
        }
    }

    /**
     * Test-only: the result Spring's method validation carries when it refuses a call — the same shape a
     * {@link HandlerMethodValidationException} would, which is why the advice answers both alike. It is
     * built by hand because this deployment validates with Hibernate Validator, whose refusals arrive as
     * a {@link jakarta.validation.ConstraintViolationException}; this is the branch the other validator
     * takes. Nothing resolves the message codes — the advice reads the default message — so the codes of
     * the resolvable are left empty.
     */
    private static MethodValidationException methodValidationException() throws NoSuchMethodException {
        Method method = PhotoCountGuard.class.getDeclaredMethod("photosPerDump", int.class);
        ParameterValidationResult result = new ParameterValidationResult(new MethodParameter(method, 0), 0,
                List.of(new DefaultMessageSourceResolvable(new String[0], null,
                        "must be greater than or equal to " + ValidationConstraints.DUMP_PHOTO_COUNT)));
        return new MethodValidationException(
                MethodValidationResult.create(new PhotoCountGuard(), method, List.of(result)));
    }

    /**
     * Test-only: a rule on the object itself, the shape E1-S7's "six <em>different</em> photo ids" will
     * take. Bean Validation can express it only as a class-level constraint, so it arrives as a global
     * error with no field to name.
     */
    @Target(ElementType.TYPE)
    @Retention(RetentionPolicy.RUNTIME)
    @Constraint(validatedBy = SixDifferentPhotoIds.Validator.class)
    @interface SixDifferentPhotoIds {

        String message() default "the six photo ids must be different";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};

        class Validator implements ConstraintValidator<SixDifferentPhotoIds, PhotoIdsRequest> {

            @Override
            public boolean isValid(PhotoIdsRequest request, ConstraintValidatorContext context) {
                List<UUID> ids = request.photoIds();
                return ids != null && ids.size() == ValidationConstraints.DUMP_PHOTO_COUNT
                        && ids.stream().distinct().count() == ValidationConstraints.DUMP_PHOTO_COUNT;
            }
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

    /** Test-only: the body the class-level rule above is attached to. */
    @SixDifferentPhotoIds
    record PhotoIdsRequest(List<UUID> photoIds) {
    }
}
