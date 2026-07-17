package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkLanguage;
import java.util.Optional;

public interface FrameworkLanguageRepository extends JpaRepository<FrameworkLanguage, Long> {
    Optional<FrameworkLanguage> findByName(String name);

    Optional<FrameworkLanguage> findByNameIgnoreCase(String name);
}
