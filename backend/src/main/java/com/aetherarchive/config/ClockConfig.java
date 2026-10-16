package com.aetherarchive.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The archive's clock, UTC (ADR-011: every instant it writes and publishes is a UTC one).
 *
 * <p>A bean rather than a call to {@link java.time.Instant#now()} inside the services, because the
 * instant an upload is stamped with decides the order of the river: a test that has to prove the
 * ordering cannot do it against a clock it does not own, and a test that has to prove a stored
 * timestamp cannot accept any instant of the day. Overriding this bean with
 * {@link Clock#fixed(java.time.Instant, java.time.ZoneId)} pins the stamp; the system clock is the
 * only implementation the application itself uses.
 */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
