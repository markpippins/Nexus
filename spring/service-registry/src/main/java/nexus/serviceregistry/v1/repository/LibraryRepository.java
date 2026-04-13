package nexus.serviceregistry.v1.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import nexus.serviceregistry.v1.entity.FrameworkLanguage;
import nexus.serviceregistry.v1.entity.Library;
import nexus.serviceregistry.v1.entity.LibraryCategory;

@Repository
public interface LibraryRepository extends JpaRepository<Library, Long> {
    Optional<Library> findByName(String name);

    Optional<Library> findByPackageName(String packageName);

    List<Library> findByCategory(LibraryCategory category);

    List<Library> findByCategory_Id(Long categoryId);

    List<Library> findByLanguage(FrameworkLanguage language);

    List<Library> findByLanguage_Id(Long languageId);

    List<Library> findByPackageManager(String packageManager);

    org.springframework.data.domain.Page<Library> findByCategory(LibraryCategory category, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Library> findByCategory_Id(Long categoryId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Library> findByLanguage(FrameworkLanguage language, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Library> findByLanguage_Id(Long languageId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Library> findByPackageManager(String packageManager, org.springframework.data.domain.Pageable pageable);
}
