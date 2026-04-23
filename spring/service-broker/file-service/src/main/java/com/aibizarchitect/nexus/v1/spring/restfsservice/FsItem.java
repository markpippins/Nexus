package com.aibizarchitect.nexus.v1.spring.restfsservice;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;

/**
 * The FsItem model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FsItem implements JsonSerializable<FsItem> {
    /*
     * The name property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String name;

    /*
     * The type property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String type;

    /*
     * The size property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final long size;

    /*
     * The lastModified property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final OffsetDateTime lastModified;

    /*
     * The lastModifiedDate property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String lastModifiedDate;

    /*
     * The url property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String url;

    /*
     * The thumbnailUrl property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String thumbnailUrl;

    /*
     * The deleteUrl property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String deleteUrl;

    /*
     * The deleteType property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String deleteType;

    /**
     * Creates an instance of FsItem class.
     * 
     * @param name the name value to set.
     * @param type the type value to set.
     * @param size the size value to set.
     * @param lastModified the lastModified value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private FsItem(String name, String type, long size, OffsetDateTime lastModified) {
        this.name = name;
        this.type = type;
        this.size = size;
        this.lastModified = lastModified;
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
    public String getType() {
        return this.type;
    }

    /**
     * Get the size property: The size property.
     * 
     * @return the size value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public long getSize() {
        return this.size;
    }

    /**
     * Get the lastModified property: The lastModified property.
     * 
     * @return the lastModified value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public OffsetDateTime getLastModified() {
        return this.lastModified;
    }

    /**
     * Get the lastModifiedDate property: The lastModifiedDate property.
     * 
     * @return the lastModifiedDate value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getLastModifiedDate() {
        return this.lastModifiedDate;
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
     * Get the thumbnailUrl property: The thumbnailUrl property.
     * 
     * @return the thumbnailUrl value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getThumbnailUrl() {
        return this.thumbnailUrl;
    }

    /**
     * Get the deleteUrl property: The deleteUrl property.
     * 
     * @return the deleteUrl value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getDeleteUrl() {
        return this.deleteUrl;
    }

    /**
     * Get the deleteType property: The deleteType property.
     * 
     * @return the deleteType value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getDeleteType() {
        return this.deleteType;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("name", this.name);
        jsonWriter.writeStringField("type", this.type);
        jsonWriter.writeLongField("size", this.size);
        jsonWriter.writeStringField("lastModified",
            this.lastModified == null ? null : DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(this.lastModified));
        jsonWriter.writeStringField("lastModifiedDate", this.lastModifiedDate);
        jsonWriter.writeStringField("url", this.url);
        jsonWriter.writeStringField("thumbnailUrl", this.thumbnailUrl);
        jsonWriter.writeStringField("deleteUrl", this.deleteUrl);
        jsonWriter.writeStringField("deleteType", this.deleteType);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FsItem from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FsItem if the JsonReader was pointing to an instance of it, or null if it was pointing to
     * JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FsItem.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FsItem fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String name = null;
            String type = null;
            long size = 0L;
            OffsetDateTime lastModified = null;
            String lastModifiedDate = null;
            String url = null;
            String thumbnailUrl = null;
            String deleteUrl = null;
            String deleteType = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("name".equals(fieldName)) {
                    name = reader.getString();
                } else if ("type".equals(fieldName)) {
                    type = reader.getString();
                } else if ("size".equals(fieldName)) {
                    size = reader.getLong();
                } else if ("lastModified".equals(fieldName)) {
                    lastModified = reader.getNullable(nonNullReader -> OffsetDateTime.parse(nonNullReader.getString()));
                } else if ("lastModifiedDate".equals(fieldName)) {
                    lastModifiedDate = reader.getString();
                } else if ("url".equals(fieldName)) {
                    url = reader.getString();
                } else if ("thumbnailUrl".equals(fieldName)) {
                    thumbnailUrl = reader.getString();
                } else if ("deleteUrl".equals(fieldName)) {
                    deleteUrl = reader.getString();
                } else if ("deleteType".equals(fieldName)) {
                    deleteType = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }
            FsItem deserializedFsItem = new FsItem(name, type, size, lastModified);
            deserializedFsItem.lastModifiedDate = lastModifiedDate;
            deserializedFsItem.url = url;
            deserializedFsItem.thumbnailUrl = thumbnailUrl;
            deserializedFsItem.deleteUrl = deleteUrl;
            deserializedFsItem.deleteType = deleteType;

            return deserializedFsItem;
        });
    }
}
