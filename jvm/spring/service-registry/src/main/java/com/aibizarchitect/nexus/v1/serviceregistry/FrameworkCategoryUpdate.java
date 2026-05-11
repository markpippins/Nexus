package com.aibizarchitect.nexus.v1.serviceregistry;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The FrameworkCategoryUpdate model.
 */
@Metadata(properties = { MetadataProperties.FLUENT })
public final class FrameworkCategoryUpdate implements JsonSerializable<FrameworkCategoryUpdate> {
    /*
     * The id property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final long id;

    /*
     * The name property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String name;

    /*
     * The activeFlag property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean activeFlag;

    /**
     * Creates an instance of FrameworkCategoryUpdate class.
     * 
     * @param id the id value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkCategoryUpdate(long id) {
        this.id = id;
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
     * Set the name property: The name property.
     * 
     * @param name the name value to set.
     * @return the FrameworkCategoryUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkCategoryUpdate setName(String name) {
        this.name = name;
        return this;
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
     * Set the activeFlag property: The activeFlag property.
     * 
     * @param activeFlag the activeFlag value to set.
     * @return the FrameworkCategoryUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkCategoryUpdate setActiveFlag(Boolean activeFlag) {
        this.activeFlag = activeFlag;
        return this;
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
        jsonWriter.writeBooleanField("activeFlag", this.activeFlag);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FrameworkCategoryUpdate from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FrameworkCategoryUpdate if the JsonReader was pointing to an instance of it, or null if it
     * was pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FrameworkCategoryUpdate.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FrameworkCategoryUpdate fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            long id = 0L;
            String name = null;
            Boolean activeFlag = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("id".equals(fieldName)) {
                    id = reader.getLong();
                } else if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("activeFlag".equals(fieldName)) {
                    activeFlag = reader.getNullable(JsonReader::getBoolean);
                } else {
                    reader.skipChildren();
                }
            }
            FrameworkCategoryUpdate deserializedFrameworkCategoryUpdate = new FrameworkCategoryUpdate(id);
            deserializedFrameworkCategoryUpdate.name = name;
            deserializedFrameworkCategoryUpdate.activeFlag = activeFlag;

            return deserializedFrameworkCategoryUpdate;
        });
    }
}
