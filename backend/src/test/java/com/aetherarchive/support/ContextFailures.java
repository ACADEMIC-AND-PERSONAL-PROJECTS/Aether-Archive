package com.aetherarchive.support;

/**
 * Reads the message of a failed context start and of every cause it wraps, so tests can assert on the
 * reason a configuration property was rejected (Spring Boot nests binding failures a few levels deep).
 */
public final class ContextFailures {

    private static final int MAX_DEPTH = 32;

    private ContextFailures() {
    }

    public static String causeChainMessages(Throwable failure) {
        StringBuilder messages = new StringBuilder();
        Throwable cause = failure;
        for (int depth = 0; cause != null && depth < MAX_DEPTH; depth++) {
            if (cause.getMessage() != null) {
                messages.append(cause.getMessage()).append('\n');
            }
            cause = cause.getCause();
        }
        return messages.toString();
    }
}
