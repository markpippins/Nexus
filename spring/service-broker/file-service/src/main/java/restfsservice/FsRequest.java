package restfsservice;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import java.util.List;

/**
 * The FsRequest model.
 */
@Metadata(properties = { MetadataProperties.FLUENT })
public final class FsRequest implements JsonSerializable<FsRequest> {
    /*
     * The token property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String token;

    /*
     * The alias property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String alias;

    /*
     * The path property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<String> path;

    /*
     * The filename property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String filename;

    /*
     * The newName property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String newName;

    /*
     * The toToken property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String toToken;

    /*
     * The toAlias property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String toAlias;

    /*
     * The toPath property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<String> toPath;

    /*
     * The items property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private List<FsItemReference> items;

    /*
     * The operation property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private String operation;

    /**
     * Creates an instance of FsRequest class.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest() {
    }

    /**
     * Get the token property: The token property.
     * 
     * @return the token value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getToken() {
        return this.token;
    }

    /**
     * Set the token property: The token property.
     * 
     * @param token the token value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setToken(String token) {
        this.token = token;
        return this;
    }

    /**
     * Get the alias property: The alias property.
     * 
     * @return the alias value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getAlias() {
        return this.alias;
    }

    /**
     * Set the alias property: The alias property.
     * 
     * @param alias the alias value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setAlias(String alias) {
        this.alias = alias;
        return this;
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
     * Set the path property: The path property.
     * 
     * @param path the path value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setPath(List<String> path) {
        this.path = path;
        return this;
    }

    /**
     * Get the filename property: The filename property.
     * 
     * @return the filename value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getFilename() {
        return this.filename;
    }

    /**
     * Set the filename property: The filename property.
     * 
     * @param filename the filename value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setFilename(String filename) {
        this.filename = filename;
        return this;
    }

    /**
     * Get the newName property: The newName property.
     * 
     * @return the newName value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getNewName() {
        return this.newName;
    }

    /**
     * Set the newName property: The newName property.
     * 
     * @param newName the newName value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setNewName(String newName) {
        this.newName = newName;
        return this;
    }

    /**
     * Get the toToken property: The toToken property.
     * 
     * @return the toToken value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getToToken() {
        return this.toToken;
    }

    /**
     * Set the toToken property: The toToken property.
     * 
     * @param toToken the toToken value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setToToken(String toToken) {
        this.toToken = toToken;
        return this;
    }

    /**
     * Get the toAlias property: The toAlias property.
     * 
     * @return the toAlias value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getToAlias() {
        return this.toAlias;
    }

    /**
     * Set the toAlias property: The toAlias property.
     * 
     * @param toAlias the toAlias value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setToAlias(String toAlias) {
        this.toAlias = toAlias;
        return this;
    }

    /**
     * Get the toPath property: The toPath property.
     * 
     * @return the toPath value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<String> getToPath() {
        return this.toPath;
    }

    /**
     * Set the toPath property: The toPath property.
     * 
     * @param toPath the toPath value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setToPath(List<String> toPath) {
        this.toPath = toPath;
        return this;
    }

    /**
     * Get the items property: The items property.
     * 
     * @return the items value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public List<FsItemReference> getItems() {
        return this.items;
    }

    /**
     * Set the items property: The items property.
     * 
     * @param items the items value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setItems(List<FsItemReference> items) {
        this.items = items;
        return this;
    }

    /**
     * Get the operation property: The operation property.
     * 
     * @return the operation value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getOperation() {
        return this.operation;
    }

    /**
     * Set the operation property: The operation property.
     * 
     * @param operation the operation value to set.
     * @return the FsRequest object itself.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest setOperation(String operation) {
        this.operation = operation;
        return this;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("token", this.token);
        jsonWriter.writeStringField("alias", this.alias);
        jsonWriter.writeArrayField("path", this.path, (writer, element) -> writer.writeString(element));
        jsonWriter.writeStringField("filename", this.filename);
        jsonWriter.writeStringField("newName", this.newName);
        jsonWriter.writeStringField("toToken", this.toToken);
        jsonWriter.writeStringField("toAlias", this.toAlias);
        jsonWriter.writeArrayField("toPath", this.toPath, (writer, element) -> writer.writeString(element));
        jsonWriter.writeArrayField("items", this.items, (writer, element) -> writer.writeJson(element));
        jsonWriter.writeStringField("operation", this.operation);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FsRequest from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FsRequest if the JsonReader was pointing to an instance of it, or null if it was pointing
     * to JSON null.
     * @throws IOException If an error occurs while reading the FsRequest.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FsRequest fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            FsRequest deserializedFsRequest = new FsRequest();
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("token".equals(fieldName)) {
                    deserializedFsRequest.token = reader.getString();
                } else if ("alias".equals(fieldName)) {
                    deserializedFsRequest.alias = reader.getString();
                } else if ("path".equals(fieldName)) {
                    List<String> path = reader.readArray(reader1 -> reader1.getString());
                    deserializedFsRequest.path = path;
                } else if ("filename".equals(fieldName)) {
                    deserializedFsRequest.filename = reader.getString();
                } else if ("newName".equals(fieldName)) {
                    deserializedFsRequest.newName = reader.getString();
                } else if ("toToken".equals(fieldName)) {
                    deserializedFsRequest.toToken = reader.getString();
                } else if ("toAlias".equals(fieldName)) {
                    deserializedFsRequest.toAlias = reader.getString();
                } else if ("toPath".equals(fieldName)) {
                    List<String> toPath = reader.readArray(reader1 -> reader1.getString());
                    deserializedFsRequest.toPath = toPath;
                } else if ("items".equals(fieldName)) {
                    List<FsItemReference> items = reader.readArray(reader1 -> FsItemReference.fromJson(reader1));
                    deserializedFsRequest.items = items;
                } else if ("operation".equals(fieldName)) {
                    deserializedFsRequest.operation = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }

            return deserializedFsRequest;
        });
    }
}
