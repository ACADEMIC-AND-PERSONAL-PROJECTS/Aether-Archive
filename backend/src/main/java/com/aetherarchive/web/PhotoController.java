package com.aetherarchive.web;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.aetherarchive.domain.PhotoCategory;
import com.aetherarchive.dto.PhotoResponse;
import com.aetherarchive.dto.ValidationConstraints;
import com.aetherarchive.service.PhotoService;

/**
 * The photo API: the upload of a capture, the chronological feed, and the photo the splash screen shows
 * ({@code /photos} and {@code /photos/random} of {@code _docs/openapi.yml}, ADR-011).
 *
 * <p>Every method is a call and a return: what is stored, what is listed and what is picked at random is
 * {@link PhotoService}'s, the request is validated here, and what leaves is a {@link PhotoResponse} — the
 * entity is never serialised, so its archive item, its position and the file's real location stay in the
 * process.
 *
 * <p>The upload's two failures come from either side of that line. A request that is not a multipart
 * request, or that carries no {@code file} part, is refused by Spring MVC before this class is reached;
 * a {@code category} that is absent, blank or not one of the contract's four values is refused as a
 * validation failure naming the field, because the constraints on the parameter are checked by Spring MVC's
 * method validation and answered by {@code ApiExceptionHandler} — the same shape a rejected JSON body
 * gets.
 */
@RestController
@RequestMapping(PhotoController.PHOTOS)
public class PhotoController {

    /** The collection, as the contract spells it: the paths of the API live under {@code /api/v1}. */
    static final String PHOTOS = "/api/v1/photos";

    private static final String RANDOM = "/random";

    private final PhotoService photoService;

    public PhotoController(PhotoService photoService) {
        this.photoService = photoService;
    }

    /**
     * Stores an upload and records it as an unassigned photo (ADR-011).
     *
     * @param file the image itself, as a required part; its {@code Content-Type} and its bytes must agree
     *     on a format the archive accepts, and its size must fit {@code AETHER_MAX_UPLOAD_MB}
     * @param category one of the contract's four values, lowercase
     * @return the created photo, with the status the contract asks for
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PhotoResponse upload(
            @RequestPart("file") MultipartFile file,
            // Optional at the binding level on purpose: the contract requires the field, and a request
            // without it has to be answered as a rejected field — `errors` naming `category` — rather
            // than as a missing request parameter, whose refusal carries no field list. Requiredness is
            // then enforced by the constraints themselves, on the value that did arrive.
            @RequestParam(name = "category", required = false)
            @NotBlank
            @Pattern(regexp = ValidationConstraints.CATEGORY_PATTERN) String category) {
        return photoService.upload(file, categoryOf(category));
    }

    /**
     * The feed: every photo, newest first.
     *
     * @return the photos as the contract describes them
     */
    @GetMapping
    public List<PhotoResponse> findAll() {
        return photoService.findAll();
    }

    /**
     * One photo of the archive, for the full-screen home screen.
     *
     * @return a photo, whichever the database picked
     */
    @GetMapping(RANDOM)
    public PhotoResponse findRandom() {
        return photoService.findRandom();
    }

    /**
     * The category the request named, as the domain enum.
     *
     * <p>The parameter is bound as a {@code String} and converted here rather than declared as a
     * {@link PhotoCategory}: Spring's own converter resolves a constant through {@code name()}, which is
     * the <em>persistence</em> spelling of a category, so the contract's lowercase value would be a
     * conversion failure — answered as a generic invalid parameter, naming no field, and calling a value
     * the API documents "unknown". The two annotations on the parameter have already rejected an absent,
     * blank or non-contract value with a field-level 400, which leaves the lookup below a value the enum
     * is known to hold; {@code PhotoCategoryTest} is what keeps the pattern and the enum in step, and this
     * branch is the guard against them drifting apart silently.
     */
    private static PhotoCategory categoryOf(String wireValue) {
        return PhotoCategory.fromWireValue(wireValue)
                .orElseThrow(() -> new IllegalStateException(
                        "a category value passed its pattern but names no constant"));
    }
}
