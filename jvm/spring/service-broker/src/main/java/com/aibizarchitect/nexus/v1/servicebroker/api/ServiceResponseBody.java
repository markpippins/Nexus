package com.aibizarchitect.nexus.v1.servicebroker.api;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.models.binarydata.BinaryData;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * The response body returned by broker service operations.
 * This is the concrete type used in API responses.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class ServiceResponseBody implements JsonSerializable<ServiceResponseBody> {
    /*
     * Whether the operation was successful.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final boolean ok;

    /*
     * The response data (present when ok is true).
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private BinaryData data;

    /*
     * Error details (present when ok is false).
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<ResponseError> errors;

    /*
     * The request ID this response corresponds to.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String requestId;

    /*
     * Timestamp when the response was generated.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final OffsetDateTime ts;

    /*
     * API version.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String version;

    /*
     * The service that processed the request.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String service;

    /*
     * The operation that was executed.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String operation;

    /*
     * Whether the response is encrypted.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean encrypt;

    /**
     * Creates an instance of ServiceResponseBody class.
     * 
     * @param ok the ok value to set.
     * @param requestId the requestId value to set.
     * @param ts the ts value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private ServiceResponseBody(boolean ok, String requestId, OffsetDateTime ts) {
        this.ok = ok;
        this.requestId = requestId;
        this.ts = ts;
    }

    /**
     * Get the ok property: Whether the operation was successful.
     * 
     * @return the ok value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public boolean isOk() {
        return this.ok;
    }

    /**
     * Get the data property: The response data (present when ok is true).
     * 
     * @return the data value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public BinaryData getData() {
        return this.data;
    }

    /**
     * Get the errors property: Error details (present when ok is false).
     * 
     * @return the errors value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<ResponseError> getErrors() {
        return this.errors;
    }

    /**
     * Get the requestId property: The request ID this response corresponds to.
     * 
     * @return the requestId value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getRequestId() {
        return this.requestId;
    }

    /**
     * Get the ts property: Timestamp when the response was generated.
     * 
     * @return the ts value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public OffsetDateTime getTs() {
        return this.ts;
    }

    /**
     * Get the version property: API version.
     * 
     * @return the version value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getVersion() {
        return this.version;
    }

    /**
     * Get the service property: The service that processed the request.
     * 
     * @return the service value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getService() {
        return this.service;
    }

    /**
     * Get the operation property: The operation that was executed.
     * 
     * @return the operation value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getOperation() {
        return this.operation;
    }

    /**
     * Get the encrypt property: Whether the response is encrypted.
     * 
     * @return the encrypt value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public Boolean isEncrypt() {
        return this.encrypt;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeBooleanField("ok", this.ok);
        jsonWriter.writeStringField("requestId", this.requestId);
        jsonWriter.writeStringField("ts",
            this.ts == null ? null : DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(this.ts));
        if (this.data != null) {
            jsonWriter.writeFieldName("data");
            this.data.writeTo(jsonWriter);
        }
        jsonWriter.writeArrayField("errors", this.errors, (writer, element) -> writer.writeJson(element));
        jsonWriter.writeStringField("version", this.version);
        jsonWriter.writeStringField("service", this.service);
        jsonWriter.writeStringField("operation", this.operation);
        jsonWriter.writeBooleanField("encrypt", this.encrypt);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of ServiceResponseBody from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of ServiceResponseBody if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the ServiceResponseBody.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static ServiceResponseBody fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            boolean ok = false;
            String requestId = null;
            OffsetDateTime ts = null;
            BinaryData data = null;
            List<ResponseError> errors = null;
            String version = null;
            String service = null;
            String operation = null;
            Boolean encrypt = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("ok".equals(fieldName)) {
                    ok = reader.getBoolean();
                } else if ("requestId".equals(fieldName)) {
                    requestId = reader.getString();
                } else if ("ts".equals(fieldName)) {
                    ts = reader.getNullable(nonNullReader -> OffsetDateTime.parse(nonNullReader.getString()));
                } else if ("data".equals(fieldName)) {
                    data = reader.getNullable(nonNullReader -> BinaryData.fromObject(nonNullReader.readUntyped()));
                } else if ("errors".equals(fieldName)) {
                    errors = reader.readArray(reader1 -> ResponseError.fromJson(reader1));
                } else if ("version".equals(fieldName)) {
                    version = reader.getString();
                } else if ("service".equals(fieldName)) {
                    service = reader.getString();
                } else if ("operation".equals(fieldName)) {
                    operation = reader.getString();
                } else if ("encrypt".equals(fieldName)) {
                    encrypt = reader.getNullable(JsonReader::getBoolean);
                } else {
                    reader.skipChildren();
                }
            }
            ServiceResponseBody deserializedServiceResponseBody = new ServiceResponseBody(ok, requestId, ts);
            deserializedServiceResponseBody.data = data;
            deserializedServiceResponseBody.errors = errors;
            deserializedServiceResponseBody.version = version;
            deserializedServiceResponseBody.service = service;
            deserializedServiceResponseBody.operation = operation;
            deserializedServiceResponseBody.encrypt = encrypt;

            return deserializedServiceResponseBody;
        });
    }
}
