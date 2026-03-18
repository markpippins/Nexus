package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.LibraryCategory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LibraryCategoryRepository extends JpaRepository<LibraryCategory, Long> {
    @Cacheable(value = "libraryCategories", key = "#name")
    Optional<LibraryCategory> findByName(String name);
}
