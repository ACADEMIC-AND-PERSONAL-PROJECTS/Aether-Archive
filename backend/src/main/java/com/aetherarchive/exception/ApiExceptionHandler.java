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
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
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
 *       written for exactly that ({@link StorageException}) or written here;</li>
 *   <li>{@code instance} is the path the client asked for, and nothing more.</li>
 * </ul>
 * A validation failure also lists the rejected fields as {@link FieldViolation} — at most
 * {@value #MAX_FIELD_VIOLATIONS} of them, so a request rejected on a hundred fields still answers in one
 * screen — and the response media type is always {@code application/problem+json}.
 *
 * <p><strong>Nothing internal leaves the process.</strong> No stack trace, no SQL, no file path, no class
 * or exception name and no rejected value: {@code .claude/rules/security.md} forbids all five in a
 * response body, and the log is where the operator reads them instead (a 5xx logs its stack trace, its
 * body does not).
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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpServletRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            addViolation(violations, error.getField(), error.getDefaultMessage());
        }
        return validationFailure(violations, request);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> handleHandlerMethodValidation(HandlerMethodValidationException ex,
            HttpServletRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        for (ParameterValidationResult result : ex.getParameterValidationResults()) {
            String field = parameterName(result);
            for (MessageSourceResolvable error : result.getResolvableErrors()) {
                addViolation(violations, field, error.getDefaultMessage());
            }
        }
        return validationFailure(violations, request);
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
     * <p>An {@link ErrorResponse} is Spring MVC refusing the request before a controller saw it — the
     * wrong verb (405), a content type the endpoint does not take (415), a refused parameter. Those keep
     * the framework's status and their own headers ({@code Allow}, {@code Accept}), and borrow their code
     * from the status, because answering 500 to a client mistake would misreport whose fault the refusal
     * is. Everything the framework says about them stays out of the body: the detail is fixed, so no
     * framework message reaches the client.
     *
     * <p>Anything else is a bug: the stack trace goes to the log, where the operator can act on it, and
     * the response is a status, a code and a sentence that say nothing about the internals.
     */
    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception ex, HttpServletRequest request) {
        if (ex instanceof ErrorResponse refusal) {
            return problemResponse(refused(refusal.getStatusCode(), request), refusal.getHeaders());
        }
        log.error("Unhandled failure while serving {} {}", request.getMethod(), request.getRequestURI(), ex);
        return problemResponse(problemBody(HttpStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_FAILURE,
                "Internal error", "The archive could not process the request.", request));
    }

    /**
     * A validation failure is a 400 listing the fields that were rejected. Only field-level violations
     * appear: a class-level constraint has no field of its own, and naming the DTO class would put a class
     * name in the body, which no response may contain.
     */
    private static ResponseEntity<ProblemDetail> validationFailure(List<FieldViolation> violations,
            HttpServletRequest request) {
        ProblemDetail body = problemBody(HttpStatus.BAD_REQUEST, CODE_VALIDATION_FAILURE, "Validation failed",
                "The request failed validation; the 'errors' collection lists the fields that were rejected.",
                request);
        body.setProperty(PROPERTY_ERRORS, violations);
        return problemResponse(body);
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
        return field != null ? field : "request";
    }

    /** A refusal that never reached a controller keeps the framework's status, and is named after it. */
    private static ProblemDetail refused(HttpStatusCode status, HttpServletRequest request) {
        if (status instanceof HttpStatus httpStatus) {
            return problemBody(status, codeOf(httpStatus), httpStatus.getReasonPhrase(), REFUSAL_DETAIL, request);
        }
        return problemBody(status, CODE_REQUEST_REJECTED, "Request rejected", REFUSAL_DETAIL, request);
    }

    /** {@code METHOD_NOT_ALLOWED} becomes {@code method-not-allowed}: stable, readable, not invented. */
    private static String codeOf(HttpStatus status) {
        return status.name().toLowerCase(Locale.ROOT).replace('_', '-');
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
