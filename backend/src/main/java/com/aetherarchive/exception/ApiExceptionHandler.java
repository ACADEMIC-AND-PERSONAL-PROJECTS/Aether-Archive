package com.aetherarchive.exception;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.method.MethodValidationException;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.ErrorResponse;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentConversionNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.aetherarchive.config.StorageProperties;

/**
 * Turns every exception that leaves a controller into an RFC 9457 {@code ProblemDetail}, so a client
 * reacts to a failure with a rule it can switch on instead of a message it has to parse.
 *
 * <p><strong>The contract.</strong> Each response carries the same fixed parts:
 * <ul>
 *   <li>{@code type} stays {@code about:blank}: the archive has no error-documentation site to point at,
 *       and RFC 9457 defines that value as "nothing more to say about this problem";</li>
 *   <li>{@code code} is the machine-readable identity of the situation — what the client switches on.
 *       The values are part of the API: renaming one is a change to the contract, not a refactor;</li>
 *   <li>{@code title} is a constant per situation, never an exception message;</li>
 *   <li>{@code detail} is one sentence for whoever has to fix the request, taken from a domain exception
 *       written for exactly that ({@link StorageException}), or from a {@link ProblemDetail} the archive
 *       raised itself, or written here;</li>
 *   <li>{@code instance} is the path the client asked for, and nothing more.</li>
 * </ul>
 * A validation failure also lists the rejected fields as {@link FieldViolation} — at most
 * {@value #MAX_FIELD_VIOLATIONS} of them, so a request rejected on a hundred fields still answers in one
 * screen — and the response media type is always {@code application/problem+json}.
 *
 * <p><strong>Nothing internal leaves the process.</strong> No stack trace and no file path, which
 * {@code .claude/rules/security.md} forbids, and no SQL, class or exception name either: the log is where
 * the operator reads them instead (a 5xx logs its stack trace, its body does not). A rejected value is not
 * echoed either, with one deliberate exception: the media type an upload declared is named in the 415
 * refusal, stripped of control characters and cut to a bounded length by
 * {@link com.aetherarchive.service.StorageService}, because a client cannot correct a {@code Content-Type}
 * it cannot see.
 *
 * <p>The storage family is mapped by <em>type</em>, not by status: the exception layer knows nothing about
 * HTTP, so {@link StorageException} decides the code and this class only decides the status.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /** Wire code of a body Jakarta Validation rejected. */
    private static final String CODE_VALIDATION_FAILURE = "validation-failure";

    /** Wire code of a body that could not be read as JSON for the endpoint. */
    private static final String CODE_MALFORMED_REQUEST = "malformed-request";

    /** Wire code of a path variable or request parameter whose value does not parse. */
    private static final String CODE_INVALID_PARAMETER = "invalid-parameter";

    /** Wire code of a multipart request that arrives without a part the endpoint requires. */
    private static final String CODE_MISSING_REQUEST_PART = "missing-request-part";

    /** Wire code of a path that neither a controller nor a static resource serves. */
    private static final String CODE_NOT_FOUND = "not-found";

    /** Wire code of a failure nobody mapped: a bug, told to the operator, never to the client. */
    private static final String CODE_INTERNAL_FAILURE = "internal-failure";

    /** Wire code of a refusal with a status that has no standard name to borrow one from. */
    private static final String CODE_REQUEST_REJECTED = "request-rejected";

    private static final String PROPERTY_CODE = "code";

    private static final String PROPERTY_ERRORS = "errors";

    private static final String TITLE_UPLOAD_TOO_LARGE = "Upload too large";

    /**
     * The field a violation is reported against when it has none of its own: a class-level rule, or a
     * constraint spanning several parameters, is still a rejection of the request.
     */
    private static final String FIELD_REQUEST = "request";

    private static final String REFUSAL_DETAIL = "The request was refused before it reached the archive.";

    private static final int MAX_FIELD_VIOLATIONS = 10;

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final StorageProperties storageProperties;

    public ApiExceptionHandler(StorageProperties storageProperties) {
        this.storageProperties = storageProperties;
    }

    /** An upload that is not an image the archive takes: the client's mistake, so a 4xx. */
    @ExceptionHandler(UnsupportedImageTypeException.class)
    ResponseEntity<ProblemDetail> handleUnsupportedImageType(UnsupportedImageTypeException ex,
            HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ex.getCode(),
                "Unsupported image type", ex.getMessage(), request));
    }

    /** An upload over the configured limit, caught by the service while it copies the bytes. */
    @ExceptionHandler(UploadTooLargeException.class)
    ResponseEntity<ProblemDetail> handleUploadTooLarge(UploadTooLargeException ex, HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.PAYLOAD_TOO_LARGE, ex.getCode(), TITLE_UPLOAD_TOO_LARGE,
                ex.getMessage(), request));
    }

    /**
     * The container refusing an oversized multipart request: it is stopped before
     * {@link com.aetherarchive.service.StorageService} sees a byte, so it cannot carry an
     * {@link UploadTooLargeException}. Same status, same code and same title as the service's refusal —
     * one upload behaves the same whichever ceiling caught it — and the limit quoted is the configured
     * one, read from {@link StorageProperties} rather than copied from it.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ProblemDetail> handleContainerUploadCeiling(HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.PAYLOAD_TOO_LARGE, UploadTooLargeException.CODE,
                TITLE_UPLOAD_TOO_LARGE, "The upload is larger than the configured limit of "
                        + storageProperties.maxUploadMb() + " MB (AETHER_MAX_UPLOAD_MB).", request));
    }

    /**
     * The archive could not store something that was otherwise acceptable. The message is the one the
     * storage layer wrote for a human and is path-free by construction; the cause, which may name a
     * path, is logged and never serialised.
     */
    @ExceptionHandler(StorageException.class)
    ResponseEntity<ProblemDetail> handleStorageFailure(StorageException ex, HttpServletRequest request) {
        log.error("Storage failure while serving {} {}", request.getMethod(), request.getRequestURI(), ex);
        return problemResponse(problemBody(HttpStatus.INTERNAL_SERVER_ERROR, ex.getCode(), "Storage failure",
                ex.getMessage(), request));
    }

    /**
     * A path variable or a request parameter whose value does not parse as the type the endpoint
     * declares — the client's typo, so a 400, and one Spring MVC would have answered the same way had the
     * advice not claimed it. Without this mapping the catch-all below would report it as an archive bug
     * (500), which is exactly backwards.
     *
     * <p>The rejected value is not echoed, and neither is the Java type it failed to parse as: a response
     * body carries no class name. The sentence names the parameter, so the client knows what to correct,
     * and points at the format the endpoint documents for it.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> handleArgumentTypeMismatch(MethodArgumentTypeMismatchException ex,
            HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.BAD_REQUEST, CODE_INVALID_PARAMETER, "Invalid parameter",
                "The parameter '" + ex.getName() + "' does not have the format this endpoint expects.",
                request));
    }

    /**
     * A handler parameter that arrived as something the resolver cannot convert at all — as opposed to a
     * value of the right kind in the wrong format, just above. The shape this endpoint meets is a
     * multipart request that carries a field of the request as a <em>file</em>: {@code curl -F
     * "category=@values.txt"} posts the category as a file part, Spring MVC finds the part and then has no
     * way to read it as the string the handler declares. It is the client's mistake, and the mapping is
     * what keeps it from being reported as an archive bug: without it the catch-all below answers 500.
     *
     * <p>The parameter is named, the value is not — it arrived as a file, which is exactly the kind of
     * client input a response body does not repeat.
     */
    @ExceptionHandler(MethodArgumentConversionNotSupportedException.class)
    ResponseEntity<ProblemDetail> handleArgumentConversionNotSupported(
            MethodArgumentConversionNotSupportedException ex, HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.BAD_REQUEST, CODE_INVALID_PARAMETER, "Invalid parameter",
                "The parameter '" + ex.getName() + "' cannot be read from the request as it was sent; send "
                        + "its value as a form field rather than as a file.", request));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpServletRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            addViolation(violations, error.getField(), error.getDefaultMessage());
        }
        // A constraint on the object itself has no field to attach to; it is reported against the request,
        // so a body that failed only a class-level rule is not answered with an empty collection.
        for (ObjectError error : ex.getBindingResult().getGlobalErrors()) {
            addViolation(violations, FIELD_REQUEST, error.getDefaultMessage());
        }
        return validationFailure(violations, request);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> handleHandlerMethodValidation(HandlerMethodValidationException ex,
            HttpServletRequest request) {
        return validationFailure(violationsOf(ex), request);
    }

    /**
     * The same rules raised outside the web layer: Spring's own method validation refuses a call before it
     * is made, whether the argument that broke a constraint belongs to a handler or to a service. It
     * carries the results in the same shape, so it answers the same way.
     */
    @ExceptionHandler(MethodValidationException.class)
    ResponseEntity<ProblemDetail> handleMethodValidation(MethodValidationException ex,
            HttpServletRequest request) {
        return validationFailure(violationsOf(ex), request);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ProblemDetail> handleConstraintViolation(ConstraintViolationException ex,
            HttpServletRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
            addViolation(violations, lastNodeOf(violation.getPropertyPath()), violation.getMessage());
        }
        return validationFailure(violations, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> handleUnreadableBody(HttpServletRequest request) {
        // The framework's message names the converters and value classes it tried ("Cannot deserialize
        // value of type `java.util.UUID`"), so it is never echoed: the client gets a sentence instead.
        return problemResponse(problemBody(HttpStatus.BAD_REQUEST, CODE_MALFORMED_REQUEST, "Malformed request",
                "The request body could not be read; it is not valid JSON for this endpoint.", request));
    }

    /**
     * A request that declares itself multipart and then cannot be read as one: a broken envelope, a part
     * header the container refuses. That is the client's mistake — the framework itself answers 400 for
     * one — so it is never reported as an archive failure.
     */
    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ProblemDetail> handleUnreadableMultipart(HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.BAD_REQUEST, CODE_MALFORMED_REQUEST, "Malformed request",
                "The multipart request could not be read; check the part headers and the boundary.", request));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    ResponseEntity<ProblemDetail> handleMissingRequestPart(MissingServletRequestPartException ex,
            HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.BAD_REQUEST, CODE_MISSING_REQUEST_PART,
                "Missing request part", "The multipart request carries no part named '"
                        + ex.getRequestPartName() + "'.", request));
    }

    /**
     * Nothing serves this path — an unknown route or a static file that is not there. The path is already
     * in {@code instance}; the exception's own message describes the resource chain, which is the
     * archive's business and not the client's.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> handleNoResource(HttpServletRequest request) {
        return problemResponse(problemBody(HttpStatus.NOT_FOUND, CODE_NOT_FOUND, "Not found",
                "The requested resource does not exist.", request));
    }

    /**
     * The last line of defence: everything no handler above claimed.
     *
     * <p>An {@link ErrorResponseException} is the archive refusing the request itself, after a controller
     * saw it — a {@code GET /photos/random} over an empty archive, for one. Its own {@link ProblemDetail}
     * is the statement it wrote for the client, so its detail is kept, and its {@code code} when the body
     * set one; flattening that into a fixed sentence would make a resource that is genuinely absent from
     * the archive indistinguishable from a path that was never mapped.
     *
     * <p>Any other {@link ErrorResponse} is Spring MVC refusing the request before a controller ran — the
     * wrong verb (405), a content type the endpoint does not take (415), a required parameter that is
     * missing (400). Those keep the framework's status and their own headers ({@code Allow},
     * {@code Accept}) and borrow their code from the status, because answering 500 to a client mistake
     * would misreport whose fault the refusal is. What the framework says about them stays out of the
     * body: their detail is fixed, so no framework message reaches the client.
     *
     * <p>Anything else is a bug: the stack trace goes to the log, where the operator can act on it, and
     * the response is a status, a code and a sentence that say nothing about the internals.
     */
    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception ex, HttpServletRequest request) {
        if (ex instanceof ErrorResponseException archiveRefusal) {
            return problemResponse(archiveRefused(archiveRefusal, request));
        }
        if (ex instanceof ErrorResponse refusal) {
            return problemResponse(refused(refusal.getStatusCode(), request), refusal.getHeaders());
        }
        log.error("Unhandled failure while serving {} {}", request.getMethod(), request.getRequestURI(), ex);
        return problemResponse(problemBody(HttpStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_FAILURE,
                "Internal error", "The archive could not process the request.", request));
    }

    /**
     * A validation failure is a 400 listing the fields that were rejected. A violation that has no field
     * of its own is reported against {@value #FIELD_REQUEST}: naming the DTO class instead would put a
     * class name in the body, which no response may contain, and listing nothing would break the promise
     * the detail makes.
     */
    private static ResponseEntity<ProblemDetail> validationFailure(List<FieldViolation> violations,
            HttpServletRequest request) {
        ProblemDetail body = problemBody(HttpStatus.BAD_REQUEST, CODE_VALIDATION_FAILURE, "Validation failed",
                "The request failed validation; the 'errors' collection lists the fields that were rejected.",
                request);
        body.setProperty(PROPERTY_ERRORS, violations);
        return problemResponse(body);
    }

    /** The violations of one method-validation result, whatever bean or handler parameter produced it. */
    private static List<FieldViolation> violationsOf(MethodValidationResult result) {
        List<FieldViolation> violations = new ArrayList<>();
        for (ParameterValidationResult parameter : result.getParameterValidationResults()) {
            String field = parameterName(parameter);
            for (MessageSourceResolvable error : parameter.getResolvableErrors()) {
                addViolation(violations, field, error.getDefaultMessage());
            }
        }
        for (MessageSourceResolvable error : result.getCrossParameterValidationResults()) {
            addViolation(violations, FIELD_REQUEST, error.getDefaultMessage());
        }
        return violations;
    }

    /** Keeps the collection bounded: a request with more than {@value #MAX_FIELD_VIOLATIONS} rejected fields
     * is cut off there, and a violation without a message is not listed as a {@code null} one. */
    private static void addViolation(List<FieldViolation> violations, String field, String message) {
        if (violations.size() < MAX_FIELD_VIOLATIONS && message != null) {
            violations.add(new FieldViolation(field, message));
        }
    }

    /** The name of a validated handler parameter, or its position when the name was not compiled in. */
    private static String parameterName(ParameterValidationResult result) {
        String name = result.getMethodParameter().getParameterName();
        return name != null ? name : "parameter[" + result.getMethodParameter().getParameterIndex() + "]";
    }

    /** The leaf of a constraint violation's path: {@code createDump.arg0.title} belongs to {@code title}. */
    private static String lastNodeOf(Path path) {
        String field = null;
        for (Path.Node node : path) {
            field = node.getName();
        }
        return field != null ? field : FIELD_REQUEST;
    }

    /**
     * The archive's own refusal keeps the sentence it wrote: its {@code detail}, and its {@code code} when
     * the body set one ({@code GET /photos/random} naming the empty archive, say). Nothing else is taken
     * from the body — the title comes from the status, because a status with no reason phrase leaves the
     * framework's own title empty.
     */
    private static ProblemDetail archiveRefused(ErrorResponseException refusal, HttpServletRequest request) {
        ProblemDetail body = refusal.getBody();
        return problemBody(refusal.getStatusCode(), codeOf(refusal.getStatusCode(), body), titleOf(
                refusal.getStatusCode()), detailOf(body), request);
    }

    /** A refusal that never reached a controller keeps the framework's status, and is named after it. */
    private static ProblemDetail refused(HttpStatusCode status, HttpServletRequest request) {
        return problemBody(status, codeOf(status), titleOf(status), REFUSAL_DETAIL, request);
    }

    /** {@code METHOD_NOT_ALLOWED} becomes {@code method-not-allowed}: stable, readable, not invented. */
    private static String codeOf(HttpStatus status) {
        return status.name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /** The status-derived code, unless a status no enum names is behind it. */
    private static String codeOf(HttpStatusCode status) {
        return status instanceof HttpStatus httpStatus ? codeOf(httpStatus) : CODE_REQUEST_REJECTED;
    }

    /** The code the refusing body chose, when it chose one; the status family's otherwise. */
    private static String codeOf(HttpStatusCode status, ProblemDetail body) {
        Object code = body.getProperties() == null ? null : body.getProperties().get(PROPERTY_CODE);
        return code instanceof String value ? value : codeOf(status);
    }

    /** The status phrase, which is what RFC 9457 asks a title to be, with a fallback for an unnamed one. */
    private static String titleOf(HttpStatusCode status) {
        return status instanceof HttpStatus httpStatus ? httpStatus.getReasonPhrase() : "Request rejected";
    }

    /** The refusing body's own sentence, or the fixed one when it carries none. */
    private static String detailOf(ProblemDetail body) {
        String detail = body.getDetail();
        return detail != null && !detail.isBlank() ? detail : REFUSAL_DETAIL;
    }

    private static ProblemDetail problemBody(HttpStatusCode status, String code, String title, String detail,
            HttpServletRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
        body.setTitle(title);
        body.setProperty(PROPERTY_CODE, code);
        URI instance = instanceOf(request);
        if (instance != null) {
            body.setInstance(instance);
        }
        return body;
    }

    /** Always the problem media type: a client tells a failure from a payload by its content type. */
    private static ResponseEntity<ProblemDetail> problemResponse(ProblemDetail body) {
        return problemResponse(body, HttpHeaders.EMPTY);
    }

    private static ResponseEntity<ProblemDetail> problemResponse(ProblemDetail body, HttpHeaders headers) {
        return ResponseEntity.status(body.getStatus())
                .headers(headers)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(body);
    }

    /**
     * The path the client asked for — useful in a bug report, and not a filesystem path. The container
     * normally hands over something that parses; when it does not, the field is dropped rather than
     * failing the error response that is being built.
     */
    private static URI instanceOf(HttpServletRequest request) {
        try {
            return URI.create(request.getRequestURI());
        }
        catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
