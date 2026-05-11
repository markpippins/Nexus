package com.aibizarchitect.nexus.v1.spring.restfsservice;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The HasFileResponse model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class HasFileResponse implements JsonSerializable<HasFileResponse> {
    /*
     * The exists property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final boolean exists;

    /**
     * Creates an instance of HasFileResponse class.
     * 
     * @param exists the exists value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private HasFileResponse(boolean exists) {
        this.exists = exists;
    }

    /**
     * Get the exists property: The exists property.
     * 
     * @return the exists value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public boolean isExists() {
        return this.exists;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeBooleanField("exists", this.exists);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of HasFileResponse from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of HasFileResponse if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the HasFileResponse.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static HasFileResponse fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            boolean exists = false;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("exists".equals(fieldName)) {
                    exists = reader.getBoolean();
                } else {
                    reader.skipChildren();
                }
            }
            return new HasFileResponse(exists);
        });
    }
}
