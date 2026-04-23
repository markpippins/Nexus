package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkCategory;
import java.util.Optional;

public interface FrameworkCategoryRepository extends JpaRepository<FrameworkCategory, Long> {
    @Cacheable(value = "frameworkCategories", key = "#name")
    Optional<FrameworkCategory> findByName(String name);
}
