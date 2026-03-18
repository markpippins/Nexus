package com.angrysurfer.spring.nexus.broker.spi;

/**
 * Interface for invoking operations on external services.
 * Implementations handle the HTTP communication with external service
 * endpoints.
 */
public interface ExternalServiceInvoker {

    /**
     * Invoke an operation on an external service
     * 
     * @param operation   The operation name to invoke
     * @param requestBody The request body to send
     * @return Result containing response data and status
     */
    InvocationResult invokeOperation(String operation, Object requestBody);

    /**
     * Perform a health check on an external service
     * 
     * @param serviceName The name of the service to check
     * @return true if the service is healthy
     */
    boolean healthCheck(String serviceName);

    /**
     * Result of an external service invocation
     */
    interface InvocationResult {
        boolean isSuccess();

        int getStatusCode();

        String getBody();

        String getErrorMessage();
    }
}
