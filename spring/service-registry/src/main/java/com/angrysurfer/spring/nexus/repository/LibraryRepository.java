package com.angrysurfer.spring.nexus.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.entity.FrameworkLanguage;
import com.angrysurfer.spring.nexus.entity.Library;
import com.angrysurfer.spring.nexus.entity.LibraryCategory;

@Repository
public interface LibraryRepository extends JpaRepository<Library, Long> {
    Optional<Library> findByName(String name);

    Optional<Library> findByPackageName(String packageName);

    List<Library> findByCategory(LibraryCategory category);

    List<Library> findByCategory_Id(Long categoryId);

    List<Library> findByLanguage(FrameworkLanguage language);

    List<Library> findByLanguage_Id(Long languageId);

    List<Library> findByPackageManager(String packageManager);
}
