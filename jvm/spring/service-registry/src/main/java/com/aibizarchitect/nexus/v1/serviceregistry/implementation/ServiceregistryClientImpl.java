package com.aibizarchitect.nexus.v1.serviceregistry.implementation;

import io.clientcore.core.http.pipeline.HttpPipeline;
import io.clientcore.core.instrumentation.Instrumentation;

/**
 * Initializes a new instance of the ServiceregistryClient type.
 */
public final class ServiceregistryClientImpl {
    /**
     * Service host.
     */
    private final String endpoint;

    /**
     * Gets Service host.
     * 
     * @return the endpoint value.
     */
    public String getEndpoint() {
        return this.endpoint;
    }

    /**
     * The HTTP pipeline to send requests through.
     */
    private final HttpPipeline httpPipeline;

    /**
     * Gets The HTTP pipeline to send requests through.
     * 
     * @return the httpPipeline value.
     */
    public HttpPipeline getHttpPipeline() {
        return this.httpPipeline;
    }

    /**
     * The instance of instrumentation to report telemetry.
     */
    private final Instrumentation instrumentation;

    /**
     * Gets The instance of instrumentation to report telemetry.
     * 
     * @return the instrumentation value.
     */
    public Instrumentation getInstrumentation() {
        return this.instrumentation;
    }

    /**
     * The FrameworkVendorsImpl object to access its operations.
     */
    private final FrameworkVendorsImpl frameworkVendors;

    /**
     * Gets the FrameworkVendorsImpl object to access its operations.
     * 
     * @return the FrameworkVendorsImpl object.
     */
    public FrameworkVendorsImpl getFrameworkVendors() {
        return this.frameworkVendors;
    }

    /**
     * The FrameworkCategoriesImpl object to access its operations.
     */
    private final FrameworkCategoriesImpl frameworkCategories;

    /**
     * Gets the FrameworkCategoriesImpl object to access its operations.
     * 
     * @return the FrameworkCategoriesImpl object.
     */
    public FrameworkCategoriesImpl getFrameworkCategories() {
        return this.frameworkCategories;
    }

    /**
     * The FrameworkLanguagesImpl object to access its operations.
     */
    private final FrameworkLanguagesImpl frameworkLanguages;

    /**
     * Gets the FrameworkLanguagesImpl object to access its operations.
     * 
     * @return the FrameworkLanguagesImpl object.
     */
    public FrameworkLanguagesImpl getFrameworkLanguages() {
        return this.frameworkLanguages;
    }

    /**
     * Initializes an instance of ServiceregistryClient client.
     * 
     * @param httpPipeline The HTTP pipeline to send requests through.
     * @param instrumentation The instance of instrumentation to report telemetry.
     * @param endpoint Service host.
     */
    public ServiceregistryClientImpl(HttpPipeline httpPipeline, Instrumentation instrumentation, String endpoint) {
        this.httpPipeline = httpPipeline;
        this.instrumentation = instrumentation;
        this.endpoint = endpoint;
        this.frameworkVendors = new FrameworkVendorsImpl(this);
        this.frameworkCategories = new FrameworkCategoriesImpl(this);
        this.frameworkLanguages = new FrameworkLanguagesImpl(this);
    }
}
