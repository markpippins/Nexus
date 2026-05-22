package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkCategory;
import java.util.Optional;

public interface FrameworkCategoryRepository extends JpaRepository<FrameworkCategory, Long> {
    Optional<FrameworkCategory> findByName(String name);
}
