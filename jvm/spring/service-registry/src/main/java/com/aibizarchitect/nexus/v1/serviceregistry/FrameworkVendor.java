package com.aibizarchitect.nexus.v1.serviceregistry;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The FrameworkVendor model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FrameworkVendor implements JsonSerializable<FrameworkVendor> {
    /*
     * The id property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final long id;

    /*
     * The name property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String name;

    /*
     * The description property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String description;

    /*
     * The url property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String url;

    /*
     * The activeFlag property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean activeFlag;

    /**
     * Creates an instance of FrameworkVendor class.
     * 
     * @param id the id value to set.
     * @param name the name value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private FrameworkVendor(long id, String name) {
        this.id = id;
        this.name = name;
    }

    /**
     * Get the id property: The id property.
     * 
     * @return the id value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public long getId() {
        return this.id;
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
     * Get the description property: The description property.
     * 
     * @return the description value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getDescription() {
        return this.description;
    }

    /**
     * Get the url property: The url property.
     * 
     * @return the url value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getUrl() {
        return this.url;
    }

    /**
     * Get the activeFlag property: The activeFlag property.
     * 
     * @return the activeFlag value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public Boolean isActiveFlag() {
        return this.activeFlag;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeLongField("id", this.id);
        jsonWriter.writeStringField("name", this.name);
        jsonWriter.writeStringField("description", this.description);
        jsonWriter.writeStringField("url", this.url);
        jsonWriter.writeBooleanField("activeFlag", this.activeFlag);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FrameworkVendor from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FrameworkVendor if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FrameworkVendor.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FrameworkVendor fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            long id = 0L;
            String name = null;
            String description = null;
            String url = null;
            Boolean activeFlag = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("id".equals(fieldName)) {
                    id = reader.getLong();
                } else if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("description".equals(fieldName)) {
                    description = reader.getString();
                } else if ("url".equals(fieldName)) {
                    url = reader.getString();
                } else if ("activeFlag".equals(fieldName)) {
                    activeFlag = reader.getNullable(JsonReader::getBoolean);
                } else {
                    reader.skipChildren();
                }
            }
            FrameworkVendor deserializedFrameworkVendor = new FrameworkVendor(id, name);
            deserializedFrameworkVendor.description = description;
            deserializedFrameworkVendor.url = url;
            deserializedFrameworkVendor.activeFlag = activeFlag;

            return deserializedFrameworkVendor;
        });
    }
}
