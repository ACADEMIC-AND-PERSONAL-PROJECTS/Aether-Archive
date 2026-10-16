package com.aetherarchive.config;

import java.nio.file.Path;
import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.aetherarchive.service.StorageInitializer;

/**
 * Serves the stored originals at {@code /images/**} (E1-S5): the bytes {@code Photo.url} names, fetched
 * by the browser like any other static file.
 *
 * <p><strong>The URL space is the images directory and nothing else.</strong> The handler is mapped to
 * {@code file:<data-dir>/images/} — the directory {@link com.aetherarchive.service.StorageService}
 * writes into — with no second location and no classpath fallback. The location ends in a slash because
 * a location that does not names a <em>file</em>: a relative lookup under it would resolve beside the
 * directory instead of inside it. The directory may not exist yet when this configuration is built (the
 * boot creates it in {@link StorageInitializer}), so the slash is appended here rather than left to
 * {@link Path#toUri()}.
 *
 * <p><strong>Nothing outside that directory can be named.</strong> A path that still contains a {@code ..}
 * after the framework's own cleaning is refused <em>before</em> any location is consulted — measured:
 * {@code ResourceHandlerUtils} logs {@code Path contains "../" after call to StringUtils#cleanPath} and the
 * request is answered 404 even when the file it names is stored — and a path that survives that is resolved
 * against the location and kept only when the result stays under it. That last check reads the URL, so a
 * filesystem link inside {@code images/} that resolves elsewhere passes it; measured, and routed to E6-S17
 * rather than papered over here. Directory listings are not an answer this handler gives: a request that
 * ends at a directory is a resource that is not served. {@code ImageServingFlowTest} pins all three: the
 * refusals, the directories, and the one request that asks what the location list actually contains.
 *
 * <p><strong>The content type comes from the stored extension, never from the client.</strong> The
 * signature says which format the bytes are ({@link com.aetherarchive.service.ImageFormat}) and the name
 * records it, so the media type of a response is decided from the file on disk — a stored {@code .png} is
 * answered as {@code image/png} whatever a client asked for or called it, and no {@code Accept} changes
 * that. Every extension the upload path can write ({@code jpg jpeg png gif webp avif}) has a media type of
 * its own; a name no upload can produce — one dropped into {@code images/} by hand — is answered from the
 * platform's own table, which is neither a second whitelist of the archive's nor a silent
 * {@code application/octet-stream}: a probe of the running server answered {@code .xyz} as
 * {@code chemical/x-xyz} and {@code .html} as {@code text/html}, and an extension absent from the table
 * would get {@code application/octet-stream}. {@code X-Content-Type-Options: nosniff} then keeps a browser
 * from second-guessing that answer: an accepted polyglot (the upload path sniffs 64 bytes and stores the
 * rest as it is, see the Sprint 1 audit, N2) is delivered as the image it was stored as and never
 * re-interpreted as script or markup.
 *
 * <p><strong>Derivatives are not served yet.</strong> Only {@code images/} is mapped: {@code thumbnails/}
 * is a directory of its own, the story that generates them decides where they are named from, and widening
 * this mapping later would silently change which directory a path under {@code /images/thumbnails/} means.
 *
 * <p><strong>A stored name never changes, so a response can be cached for a year.</strong> Files are
 * named by UUID and are never rewritten; a deleted one answers 404 and a new upload gets a new name, so
 * {@code public, max-age=31536000, immutable} costs nothing and spares the archive a conditional request
 * per image per page render. The header is set by the resource handler, so the refusal that answers a
 * missing image carries none of it — a 404 is not cached for a year.
 */
@Configuration(proxyBeanMethods = false)
public class ImageServingConfig implements WebMvcConfigurer {

    /** The URL space of the stored originals; {@code Photo.url} is a path under it (ADR-011). */
    static final String IMAGES_PATTERN = "/images/**";

    /** Tells a browser not to sniff a served file's type — the audit's SEC-N2 hardening. */
    private static final String NOSNIFF_HEADER = "X-Content-Type-Options";

    private static final String NOSNIFF_VALUE = "nosniff";

    /** One year in seconds: the {@code Max-Age} of RFC 9111's own example of a long-lived response. */
    private static final long ONE_YEAR_SECONDS = 31_536_000L;

    private static final Logger log = LoggerFactory.getLogger(ImageServingConfig.class);

    private final StorageProperties properties;

    public ImageServingConfig(StorageProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = imagesLocation();
        registry.addResourceHandler(IMAGES_PATTERN)
                .addResourceLocations(location)
                .setCacheControl(CacheControl.maxAge(Duration.ofSeconds(ONE_YEAR_SECONDS))
                        .cachePublic()
                        .immutable());
        log.info("Serving stored images at {} from {}", IMAGES_PATTERN, location);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new NoSniffInterceptor()).addPathPatterns(IMAGES_PATTERN);
    }

    /**
     * The images directory as a resource location: an absolute {@code file:} URL ending in a slash, so a
     * relative resource path is resolved <em>inside</em> it.
     *
     * <p>{@link Path#toUri()} appends the slash only when the path is a directory at the moment it is
     * asked, and this configuration may be built before {@link StorageInitializer} has created the
     * directory (or in a test, against one that never exists). The framework appends a missing one itself
     * — it warns and does so, measured — so this is not the only thing keeping the mapping correct; it
     * keeps the location used identical to the location logged, and the startup log free of a warning
     * about a condition this code already knows.
     */
    private String imagesLocation() {
        String location = properties.dataDir().resolve(StorageInitializer.IMAGES_DIR).toUri().toString();
        return location.endsWith("/") ? location : location + "/";
    }

    /**
     * Stamps every answer under {@code /images/**} — the stored file and the refusal that names a missing
     * one alike — with {@code X-Content-Type-Options: nosniff}.
     *
     * <p>It is an interceptor and not a second resource handler option because the resource handler has no
     * hook for headers beyond the cache policy it sets itself. The header travels with the path, so it
     * reaches the 404 the advice writes just as it reaches a served file, and it stays off the API: a JSON
     * response has an explicit media type and is not a file a browser may render.
     */
    private static final class NoSniffInterceptor implements HandlerInterceptor {

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            response.setHeader(NOSNIFF_HEADER, NOSNIFF_VALUE);
            return true;
        }
    }
}
