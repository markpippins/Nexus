package restfsservice.implementation;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;
import restfsservice.FsRequest;

/**
 * The DeleteFileRequest model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class DeleteFileRequest implements JsonSerializable<DeleteFileRequest> {
    /*
     * The input property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final FsRequest input;

    /**
     * Creates an instance of DeleteFileRequest class.
     * 
     * @param input the input value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public DeleteFileRequest(FsRequest input) {
        this.input = input;
    }

    /**
     * Get the input property: The input property.
     * 
     * @return the input value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public FsRequest getInput() {
        return this.input;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeJsonField("input", this.input);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of DeleteFileRequest from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of DeleteFileRequest if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the DeleteFileRequest.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static DeleteFileRequest fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            FsRequest input = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("input".equals(fieldName)) {
                    input = FsRequest.fromJson(reader);
                } else {
                    reader.skipChildren();
                }
            }
            return new DeleteFileRequest(input);
        });
    }
}
