package com.aibizarchitect.nexus.v1.servicebroker.api;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * Broker Service API Models
 * 
 * Defines the core data contracts for submitting requests and receiving responses
 * from the service broker.Error detail structure for failed responses.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class ResponseError implements JsonSerializable<ResponseError> {
    /*
     * The field associated with the error.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String field;

    /*
     * The error message.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String message;

    /**
     * Creates an instance of ResponseError class.
     * 
     * @param field the field value to set.
     * @param message the message value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private ResponseError(String field, String message) {
        this.field = field;
        this.message = message;
    }

    /**
     * Get the field property: The field associated with the error.
     * 
     * @return the field value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getField() {
        return this.field;
    }

    /**
     * Get the message property: The error message.
     * 
     * @return the message value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getMessage() {
        return this.message;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("field", this.field);
        jsonWriter.writeStringField("message", this.message);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of ResponseError from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of ResponseError if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the ResponseError.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static ResponseError fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String field = null;
            String message = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("field".equals(fieldName)) {
                    field = reader.getString();
                } else if ("message".equals(fieldName)) {
                    message = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }
            return new ResponseError(field, message);
        });
    }
}
