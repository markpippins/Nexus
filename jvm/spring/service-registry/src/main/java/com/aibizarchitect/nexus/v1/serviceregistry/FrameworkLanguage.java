package com.aibizarchitect.nexus.v1.serviceregistry;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The FrameworkLanguage model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FrameworkLanguage implements JsonSerializable<FrameworkLanguage> {
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
     * The currentVersion property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String currentVersion;

    /*
     * The ltsVersion property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String ltsVersion;

    /**
     * Creates an instance of FrameworkLanguage class.
     * 
     * @param id the id value to set.
     * @param name the name value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private FrameworkLanguage(long id, String name) {
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
     * Get the currentVersion property: The currentVersion property.
     * 
     * @return the currentVersion value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getCurrentVersion() {
        return this.currentVersion;
    }

    /**
     * Get the ltsVersion property: The ltsVersion property.
     * 
     * @return the ltsVersion value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getLtsVersion() {
        return this.ltsVersion;
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
        jsonWriter.writeStringField("currentVersion", this.currentVersion);
        jsonWriter.writeStringField("ltsVersion", this.ltsVersion);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FrameworkLanguage from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FrameworkLanguage if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FrameworkLanguage.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FrameworkLanguage fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            long id = 0L;
            String name = null;
            String currentVersion = null;
            String ltsVersion = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("id".equals(fieldName)) {
                    id = reader.getLong();
                } else if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("currentVersion".equals(fieldName)) {
                    currentVersion = reader.getString();
                } else if ("ltsVersion".equals(fieldName)) {
                    ltsVersion = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }
            FrameworkLanguage deserializedFrameworkLanguage = new FrameworkLanguage(id, name);
            deserializedFrameworkLanguage.currentVersion = currentVersion;
            deserializedFrameworkLanguage.ltsVersion = ltsVersion;

            return deserializedFrameworkLanguage;
        });
    }
}
