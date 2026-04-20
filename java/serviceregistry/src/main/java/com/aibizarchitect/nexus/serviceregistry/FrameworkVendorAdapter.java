package com.aibizarchitect.nexus.serviceregistry;

/** Lightweight adapter to migrate from Spring's FrameworkVendor (legacy) to the new core vendor. */
public class FrameworkVendorAdapter {
    public static FrameworkVendor toCanonical(Object legacy) {
        if (legacy == null) return null;
        try {
            Class<?> cls = legacy.getClass();
            Object id = cls.getMethod("getId").invoke(legacy);
            Object name = cls.getMethod("getName").invoke(legacy);
            Object description = cls.getMethod("getDescription").invoke(legacy);
            Object url = cls.getMethod("getUrl").invoke(legacy);
            Object activeFlag = cls.getMethod("getActiveFlag").invoke(legacy);
            return new FrameworkVendor(id != null ? (Long) id : null,
                name != null ? name.toString() : null,
                description != null ? description.toString() : null,
                url != null ? url.toString() : null,
                activeFlag != null ? (Boolean) activeFlag : null);
        } catch (Exception e) {
            return new FrameworkVendor();
        }
    }

    public static Object fromCanonical(FrameworkVendor core) {
        if (core == null) return null;
        try {
            Class<?> legacyClass = Class.forName("nexus.serviceregistry.v1.entity.FrameworkVendor");
            java.lang.reflect.Constructor<?> ctor = legacyClass.getConstructor(Long.class, String.class, String.class, String.class, Boolean.class);
            return ctor.newInstance(core.getId(), core.getName(), core.getDescription(), core.getUrl(), core.getActiveFlag());
        } catch (Exception e) {
            return null;
        }
    }
}
