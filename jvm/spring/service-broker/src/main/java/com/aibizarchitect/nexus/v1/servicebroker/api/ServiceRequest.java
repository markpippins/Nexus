package com.aibizarchitect.nexus.v1.servicebroker.api;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.models.binarydata.BinaryData;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.util.Map;

/**
 * A request submitted to the service broker for processing.
 */
@Metadata(properties = { MetadataProperties.FLUENT })
public final class ServiceRequest implements JsonSerializable<ServiceRequest> {
    /*
     * The target service name to invoke.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String service;

    /*
     * The operation name to execute on the target service.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String operation;

    /*
     * Parameters to pass to the operation.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final Map<String, BinaryData> params;

    /*
     * Unique identifier for tracking this request.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String requestId;

    /*
     * Whether the request/response should be encrypted.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean encrypt;

    /**
     * Creates an instance of ServiceRequest class.
     * 
     * @param service the service value to set.
     * @param operation the operation value to set.
     * @param params the params value to set.
     * @param requestId the requestId value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public ServiceRequest(String service, String operation, Map<String, BinaryData> params, String requestId) {
        this.service = service;
        this.operation = operation;
        this.params = params;
        this.requestId = requestId;
    }

    /**
     * Get the service property: The target service name to invoke.
     * 
     * @return the service value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getService() {
        return this.service;
    }

    /**
     * Get the operation property: The operation name to execute on the target service.
     * 
     * @return the operation value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getOperation() {
        return this.operation;
    }

    /**
     * Get the params property: Parameters to pass to the operation.
     * 
     * @return the params value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public Map<String, BinaryData> getParams() {
        return this.params;
    }

    /**
     * Get the requestId property: Unique identifier for tracking this request.
     * 
     * @return the requestId value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getRequestId() {
        return this.requestId;
    }

    /**
     * Get the encrypt property: Whether the request/response should be encrypted.
     * 
     * @return the encrypt value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public Boolean isEncrypt() {
        return this.encrypt;
    }

    /**
     * Set the encrypt property: Whether the request/response should be encrypted.
     * 
     * @param encrypt the encrypt value to set.
     * @return the ServiceRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public ServiceRequest setEncrypt(Boolean encrypt) {
        this.encrypt = encrypt;
        return this;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("service", this.service);
        jsonWriter.writeStringField("operation", this.operation);
        jsonWriter.writeMapField("params", this.params, (writer, element) -> {
            if (element == null) {
                writer.writeNull();
            } else {
                element.writeTo(writer);
            }
        });
        jsonWriter.writeStringField("requestId", this.requestId);
        jsonWriter.writeBooleanField("encrypt", this.encrypt);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of ServiceRequest from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of ServiceRequest if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the ServiceRequest.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static ServiceRequest fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String service = null;
            String operation = null;
            Map<String, BinaryData> params = null;
            String requestId = null;
            Boolean encrypt = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("service".equals(fieldName)) {
                    service = reader.getString();
                } else if ("operation".equals(fieldName)) {
                    operation = reader.getString();
                } else if ("params".equals(fieldName)) {
                    params = reader.readMap(reader1 -> reader1
                        .getNullable(nonNullReader -> BinaryData.fromObject(nonNullReader.readUntyped())));
                } else if ("requestId".equals(fieldName)) {
                    requestId = reader.getString();
                } else if ("encrypt".equals(fieldName)) {
                    encrypt = reader.getNullable(JsonReader::getBoolean);
                } else {
                    reader.skipChildren();
                }
            }
            ServiceRequest deserializedServiceRequest = new ServiceRequest(service, operation, params, requestId);
            deserializedServiceRequest.encrypt = encrypt;

            return deserializedServiceRequest;
        });
    }
}
