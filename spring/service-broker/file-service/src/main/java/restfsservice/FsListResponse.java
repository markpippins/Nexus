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
 * The FsListResponse model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class FsListResponse implements JsonSerializable<FsListResponse> {
    /*
     * The path property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final List<String> path;

    /*
     * The items property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final List<FsItem> items;

    /**
     * Creates an instance of FsListResponse class.
     * 
     * @param path the path value to set.
     * @param items the items value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private FsListResponse(List<String> path, List<FsItem> items) {
        this.path = path;
        this.items = items;
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
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeArrayField("path", this.path, (writer, element) -> writer.writeString(element));
        jsonWriter.writeArrayField("items", this.items, (writer, element) -> writer.writeJson(element));
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of FsListResponse from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of FsListResponse if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the FsListResponse.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static FsListResponse fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            List<String> path = null;
            List<FsItem> items = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("path".equals(fieldName)) {
                    path = reader.readArray(reader1 -> reader1.getString());
                } else if ("items".equals(fieldName)) {
                    items = reader.readArray(reader1 -> FsItem.fromJson(reader1));
                } else {
                    reader.skipChildren();
                }
            }
            return new FsListResponse(path, items);
        });
    }
}
