package com.aibizarchitect.nexus.v1.spring.restfsservice;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.util.List;

/**
 * The FsOperationResponse model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FsOperationResponse implements JsonSerializable<FsOperationResponse> {
    /*
     * The path property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<String> path;

    /*
     * The items property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<FsItem> items;

    /*
     * The created property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String created;

    /*
     * The deleted property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String deleted;

    /*
     * The created_file property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String createdFile;

    /*
     * The deleted_file property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String deletedFile;

    /*
     * The renamed property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String renamed;

    /*
     * The to property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String to;

    /*
     * The copied property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String copied;

    /*
     * The moved property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String moved;

    /*
     * The exists property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private Boolean exists;

    /*
     * The type property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String type;

    /**
     * Creates an instance of FsOperationResponse class.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private FsOperationResponse() {
    }

    /**
     * Get the path property: The path property.
     * 
     * @return the path value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<String> getPath() {
        return this.path;
    }

    /**
     * Get the items property: The items property.
     * 
     * @return the items value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<FsItem> getItems() {
        return this.items;
    }

    /**
     * Get the created property: The created property.
     * 
     * @return the created value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getCreated() {
        return this.created;
    }

    /**
     * Get the deleted property: The deleted property.
     * 
     * @return the deleted value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getDeleted() {
        return this.deleted;
    }

    /**
     * Get the createdFile property: The created_file property.
     * 
     * @return the createdFile value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getCreatedFile() {
        return this.createdFile;
    }

    /**
     * Get the deletedFile property: The deleted_file property.
     * 
     * @return the deletedFile value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getDeletedFile() {
        return this.deletedFile;
    }

    /**
     * Get the renamed property: The renamed property.
     * 
     * @return the renamed value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getRenamed() {
        return this.renamed;
    }

    /**
     * Get the to property: The to property.
     * 
     * @return the to value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getTo() {
        return this.to;
    }

    /**
     * Get the copied property: The copied property.
     * 
     * @return the copied value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getCopied() {
        return this.copied;
    }

    /**
     * Get the moved property: The moved property.
     * 
     * @return the moved value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getMoved() {
        return this.moved;
    }

    /**
     * Get the exists property: The exists property.
     * 
     * @return the exists value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public Boolean isExists() {
        return this.exists;
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
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeArrayField("path", this.path, (writer, element) -> writer.writeString(element));
        jsonWriter.writeArrayField("items", this.items, (writer, element) -> writer.writeJson(element));
        jsonWriter.writeStringField("created", this.created);
        jsonWriter.writeStringField("deleted", this.deleted);
        jsonWriter.writeStringField("created_file", this.createdFile);
        jsonWriter.writeStringField("deleted_file", this.deletedFile);
        jsonWriter.writeStringField("renamed", this.renamed);
        jsonWriter.writeStringField("to", this.to);
        jsonWriter.writeStringField("copied", this.copied);
        jsonWriter.writeStringField("moved", this.moved);
        jsonWriter.writeBooleanField("exists", this.exists);
        jsonWriter.writeStringField("type", this.type);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FsOperationResponse from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FsOperationResponse if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IOException If an error occurs while reading the FsOperationResponse.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FsOperationResponse fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            FsOperationResponse deserializedFsOperationResponse = new FsOperationResponse();
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("path".equals(fieldName)) {
                    List<String> path = reader.readArray(reader1 -> reader1.getString());
                    deserializedFsOperationResponse.path = path;
                } else if ("items".equals(fieldName)) {
                    List<FsItem> items = reader.readArray(reader1 -> FsItem.fromJson(reader1));
                    deserializedFsOperationResponse.items = items;
                } else if ("created".equals(fieldName)) {
                    deserializedFsOperationResponse.created = reader.getString();
                } else if ("deleted".equals(fieldName)) {
                    deserializedFsOperationResponse.deleted = reader.getString();
                } else if ("created_file".equals(fieldName)) {
                    deserializedFsOperationResponse.createdFile = reader.getString();
                } else if ("deleted_file".equals(fieldName)) {
                    deserializedFsOperationResponse.deletedFile = reader.getString();
                } else if ("renamed".equals(fieldName)) {
                    deserializedFsOperationResponse.renamed = reader.getString();
                } else if ("to".equals(fieldName)) {
                    deserializedFsOperationResponse.to = reader.getString();
                } else if ("copied".equals(fieldName)) {
                    deserializedFsOperationResponse.copied = reader.getString();
                } else if ("moved".equals(fieldName)) {
                    deserializedFsOperationResponse.moved = reader.getString();
                } else if ("exists".equals(fieldName)) {
                    deserializedFsOperationResponse.exists = reader.getNullable(JsonReader::getBoolean);
                } else if ("type".equals(fieldName)) {
                    deserializedFsOperationResponse.type = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }

            return deserializedFsOperationResponse;
        });
    }
}
