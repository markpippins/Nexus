package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.CategoriesView;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.CategoriesViewId;

/**
 * Spring Data JPA repository for the read-only {@link CategoriesView} entity
 * backed by the {@code registry.categories} database view.
 */
@Repository
public interface CategoriesViewRepository extends JpaRepository<CategoriesView, CategoriesViewId> {

    /**
     * Return categories filtered by the {@code type} discriminator
     * (e.g. {@code "framework_type"}, {@code "server_type"}) with pagination.
     */
    Page<CategoriesView> findByType(String type, Pageable pageable);

    /**
     * Return categories filtered by both name and type.
     */
    Page<CategoriesView> findByNameContainingIgnoreCaseAndType(String name, String type, Pageable pageable);
}
