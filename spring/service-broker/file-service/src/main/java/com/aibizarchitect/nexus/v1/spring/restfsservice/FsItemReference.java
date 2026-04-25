package com.aibizarchitect.nexus.v1.spring.restfsservice;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The FsItemReference model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FsItemReference implements JsonSerializable<FsItemReference> {
    /*
     * The name property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String name;

    /*
     * The type property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final FsItemReferenceType type;

    /**
     * Creates an instance of FsItemReference class.
     * 
     * @param name the name value to set.
     * @param type the type value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsItemReference(String name, FsItemReferenceType type) {
        this.name = name;
        this.type = type;
    }

    /**
     * Get the name property: The name property.
     * 
     * @return the name value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getName() {
        return this.name;
    }

    /**
     * Get the type property: The type property.
     * 
     * @return the type value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsItemReferenceType getType() {
        return this.type;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("name", this.name);
        jsonWriter.writeStringField("type", this.type == null ? null : this.type.toString());
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FsItemReference from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FsItemReference if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FsItemReference.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FsItemReference fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String name = null;
            FsItemReferenceType type = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("type".equals(fieldName)) {
                    type = FsItemReferenceType.fromString(reader.getString());
                } else {
                    reader.skipChildren();
                }
            }
            return new FsItemReference(name, type);
        });
    }
}
