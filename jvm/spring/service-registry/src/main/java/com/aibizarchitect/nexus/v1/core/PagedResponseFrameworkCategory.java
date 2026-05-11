package com.aibizarchitect.nexus.v1.core;

import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategory;
import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.util.List;

/**
 * Generic paged wrapper for API responses.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class PagedResponseFrameworkCategory implements JsonSerializable<PagedResponseFrameworkCategory> {
    /*
     * The data property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final List<FrameworkCategory> data;

    /*
     * The totalElements property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final long totalElements;

    /*
     * The totalPages property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final int totalPages;

    /*
     * The number property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final int number;

    /*
     * The numberOfElements property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final int numberOfElements;

    /*
     * The size property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final int size;

    /**
     * Creates an instance of PagedResponseFrameworkCategory class.
     * 
     * @param data the data value to set.
     * @param totalElements the totalElements value to set.
     * @param totalPages the totalPages value to set.
     * @param number the number value to set.
     * @param numberOfElements the numberOfElements value to set.
     * @param size the size value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private PagedResponseFrameworkCategory(List<FrameworkCategory> data, long totalElements, int totalPages, int number,
        int numberOfElements, int size) {
        this.data = data;
        this.totalElements = totalElements;
        this.totalPages = totalPages;
        this.number = number;
        this.numberOfElements = numberOfElements;
        this.size = size;
    }

    /**
     * Get the data property: The data property.
     * 
     * @return the data value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<FrameworkCategory> getData() {
        return this.data;
    }

    /**
     * Get the totalElements property: The totalElements property.
     * 
     * @return the totalElements value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public long getTotalElements() {
        return this.totalElements;
    }

    /**
     * Get the totalPages property: The totalPages property.
     * 
     * @return the totalPages value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public int getTotalPages() {
        return this.totalPages;
    }

    /**
     * Get the number property: The number property.
     * 
     * @return the number value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public int getNumber() {
        return this.number;
    }

    /**
     * Get the numberOfElements property: The numberOfElements property.
     * 
     * @return the numberOfElements value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public int getNumberOfElements() {
        return this.numberOfElements;
    }

    /**
     * Get the size property: The size property.
     * 
     * @return the size value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public int getSize() {
        return this.size;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeArrayField("data", this.data, (writer, element) -> writer.writeJson(element));
        jsonWriter.writeLongField("totalElements", this.totalElements);
        jsonWriter.writeIntField("totalPages", this.totalPages);
        jsonWriter.writeIntField("number", this.number);
        jsonWriter.writeIntField("numberOfElements", this.numberOfElements);
        jsonWriter.writeIntField("size", this.size);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of PagedResponseFrameworkCategory from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of PagedResponseFrameworkCategory if the JsonReader was pointing to an instance of it, or
     * null if it was pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the PagedResponseFrameworkCategory.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static PagedResponseFrameworkCategory fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            List<FrameworkCategory> data = null;
            long totalElements = 0L;
            int totalPages = 0;
            int number = 0;
            int numberOfElements = 0;
            int size = 0;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("data".equals(fieldName)) {
                    data = reader.readArray(reader1 -> FrameworkCategory.fromJson(reader1));
                } else if ("totalElements".equals(fieldName)) {
                    totalElements = reader.getLong();
                } else if ("totalPages".equals(fieldName)) {
                    totalPages = reader.getInt();
                } else if ("number".equals(fieldName)) {
                    number = reader.getInt();
                } else if ("numberOfElements".equals(fieldName)) {
                    numberOfElements = reader.getInt();
                } else if ("size".equals(fieldName)) {
                    size = reader.getInt();
                } else {
                    reader.skipChildren();
                }
            }
            return new PagedResponseFrameworkCategory(data, totalElements, totalPages, number, numberOfElements, size);
        });
    }
}
