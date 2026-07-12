package com.aibizarchitect.nexus.v1.spring.serviceregistry.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Composite primary key for the read-only {@link CategoriesView} entity.
 *
 * The {@code registry.categories} view UNIONs ALL rows from 7 type lookup
 * tables where the same numeric {@code id} can appear across different type
 * discriminators (e.g. {@code framework_type.id=1} and {@code server_type.id=1}).
 * Pairing {@code id} with {@code type} gives a unique identity that prevents
 * Hibernate's persistence context from conflating rows from different groups.
 */
public class CategoriesViewId implements Serializable {

    private Long id;
    private String type;

    public CategoriesViewId() {
    }

    public CategoriesViewId(Long id, String type) {
        this.id = id;
        this.type = type;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CategoriesViewId)) return false;
        CategoriesViewId that = (CategoriesViewId) o;
        return Objects.equals(id, that.id) && Objects.equals(type, that.type);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, type);
    }
}
