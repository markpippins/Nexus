package restfsservice;

/**
 * Defines values for FsItemReferenceType.
 */
public enum FsItemReferenceType {
    /**
     * Enum value file.
     */
    FILE("file"),

    /**
     * Enum value folder.
     */
    FOLDER("folder");

    /**
     * The actual serialized value for a FsItemReferenceType instance.
     */
    private final String value;

    FsItemReferenceType(String value) {
        this.value = value;
    }

    /**
     * Parses a serialized value to a FsItemReferenceType instance.
     * 
     * @param value the serialized value to parse.
     * @return the parsed FsItemReferenceType object, or null if unable to parse.
     */
    public static FsItemReferenceType fromString(String value) {
        if (value == null) {
            return null;
        }
        FsItemReferenceType[] items = FsItemReferenceType.values();
        for (FsItemReferenceType item : items) {
            if (item.toString().equalsIgnoreCase(value)) {
                return item;
            }
        }
        return null;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return this.value;
    }
}
