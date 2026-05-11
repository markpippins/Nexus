package com.aibizarchitect.nexus.v1.serviceregistry;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The FrameworkLanguageUpdate model.
 */
@Metadata(properties = { MetadataProperties.FLUENT })
public final class FrameworkLanguageUpdate implements JsonSerializable<FrameworkLanguageUpdate> {
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
     * The currentVersion property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String currentVersion;

    /*
     * The ltsVersion property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String ltsVersion;

    /*
     * The activeFlag property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean activeFlag;

    /**
     * Creates an instance of FrameworkLanguageUpdate class.
     * 
     * @param name the name value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate(String name) {
        this.name = name;
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
     * Set the description property: The description property.
     * 
     * @param description the description value to set.
     * @return the FrameworkLanguageUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate setDescription(String description) {
        this.description = description;
        return this;
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
     * Set the url property: The url property.
     * 
     * @param url the url value to set.
     * @return the FrameworkLanguageUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate setUrl(String url) {
        this.url = url;
        return this;
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
     * Set the currentVersion property: The currentVersion property.
     * 
     * @param currentVersion the currentVersion value to set.
     * @return the FrameworkLanguageUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate setCurrentVersion(String currentVersion) {
        this.currentVersion = currentVersion;
        return this;
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
     * Set the ltsVersion property: The ltsVersion property.
     * 
     * @param ltsVersion the ltsVersion value to set.
     * @return the FrameworkLanguageUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate setLtsVersion(String ltsVersion) {
        this.ltsVersion = ltsVersion;
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
     * @return the FrameworkLanguageUpdate object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FrameworkLanguageUpdate setActiveFlag(Boolean activeFlag) {
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
        jsonWriter.writeStringField("name", this.name);
        jsonWriter.writeStringField("description", this.description);
        jsonWriter.writeStringField("url", this.url);
        jsonWriter.writeStringField("currentVersion", this.currentVersion);
        jsonWriter.writeStringField("ltsVersion", this.ltsVersion);
        jsonWriter.writeBooleanField("activeFlag", this.activeFlag);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FrameworkLanguageUpdate from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FrameworkLanguageUpdate if the JsonReader was pointing to an instance of it, or null if it
     * was pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FrameworkLanguageUpdate.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FrameworkLanguageUpdate fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String name = null;
            String description = null;
            String url = null;
            String currentVersion = null;
            String ltsVersion = null;
            Boolean activeFlag = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("description".equals(fieldName)) {
                    description = reader.getString();
                } else if ("url".equals(fieldName)) {
                    url = reader.getString();
                } else if ("currentVersion".equals(fieldName)) {
                    currentVersion = reader.getString();
                } else if ("ltsVersion".equals(fieldName)) {
                    ltsVersion = reader.getString();
                } else if ("activeFlag".equals(fieldName)) {
                    activeFlag = reader.getNullable(JsonReader::getBoolean);
                } else {
                    reader.skipChildren();
                }
            }
            FrameworkLanguageUpdate deserializedFrameworkLanguageUpdate = new FrameworkLanguageUpdate(name);
            deserializedFrameworkLanguageUpdate.description = description;
            deserializedFrameworkLanguageUpdate.url = url;
            deserializedFrameworkLanguageUpdate.currentVersion = currentVersion;
            deserializedFrameworkLanguageUpdate.ltsVersion = ltsVersion;
            deserializedFrameworkLanguageUpdate.activeFlag = activeFlag;

            return deserializedFrameworkLanguageUpdate;
        });
    }
}
