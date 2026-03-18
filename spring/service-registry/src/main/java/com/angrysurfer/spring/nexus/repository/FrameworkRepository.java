package com.angrysurfer.spring.nexus.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.FrameworkCategory;
import com.angrysurfer.spring.nexus.entity.FrameworkLanguage;

@Repository
public interface FrameworkRepository extends JpaRepository<Framework, Long> {
    Optional<Framework> findByName(String name);

    @Cacheable(value = "frameworksByCategory", key = "#category.id")
    List<Framework> findByCategory(FrameworkCategory category);

    List<Framework> findByCategory_Id(Long categoryId);

    @Cacheable(value = "frameworksByLanguage", key = "#language.id")
    List<Framework> findByLanguage(FrameworkLanguage language);

    List<Framework> findByLanguage_Id(Long languageId);
}
