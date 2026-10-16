package com.aetherarchive.web;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.aetherarchive.dto.DumpCreateRequest;
import com.aetherarchive.dto.DumpResponse;
import com.aetherarchive.service.DumpService;

/**
 * The dump API: publishing a monthly compilation of six photos, and reading the published ones back
 * ({@code /dumps} of {@code _docs/openapi.yml}, ADR-011).
 *
 * <p>Every method is a call and a return. What a dump is — six different photos of the archive, none of
 * them curated yet, the position each one takes and the instant the compilation is stamped with — is
 * {@link DumpService}'s, the shape of the body is validated here, and what leaves is a
 * {@link DumpResponse}: the entity is never serialised, so its type and its items stay in the process.
 *
 * <p>The two refusals of a publish arrive by different roads and look alike on purpose: a body that is not
 * JSON, or that breaks a constraint of {@link DumpCreateRequest}, is answered by Spring MVC and
 * {@code ApiExceptionHandler}; a body that is well formed but names six photos the archive cannot publish
 * is refused by the service. Both are a 400 listing the fields to correct, because the client's repair is
 * the same in both cases.
 */
@RestController
@RequestMapping(DumpController.DUMPS)
public class DumpController {

    /** The collection, as the contract spells it: the paths of the API live under {@code /api/v1}. */
    static final String DUMPS = "/api/v1/dumps";

    private final DumpService dumpService;

    public DumpController(DumpService dumpService) {
        this.dumpService = dumpService;
    }

    /**
     * Publishes a dump: the six photos the body names, in the order it names them, under the aura and the
     * optional title it chose.
     *
     * @param request the contract's {@code DumpCreate} body; its constraints are validated before this
     *     method runs, and the rules they cannot state are the service's
     * @return the created dump, with the status the contract asks for
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DumpResponse create(@Valid @RequestBody DumpCreateRequest request) {
        return dumpService.create(request);
    }

    /**
     * Every published dump, newest first, each with its photos in curation order.
     *
     * @return the dumps as the contract describes them
     */
    @GetMapping
    public List<DumpResponse> findAll() {
        return dumpService.findAll();
    }
}
