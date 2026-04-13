package nexus.serviceregistry.v1.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import nexus.serviceregistry.v1.entity.Framework;
import nexus.serviceregistry.v1.entity.FrameworkCategory;
import nexus.serviceregistry.v1.entity.FrameworkLanguage;

@Repository
public interface FrameworkRepository extends JpaRepository<Framework, Long> {
    Optional<Framework> findByName(String name);

    @Cacheable(value = "frameworksByCategory", key = "#category.id")
    List<Framework> findByCategory(FrameworkCategory category);

    List<Framework> findByCategory_Id(Long categoryId);

    @Cacheable(value = "frameworksByLanguage", key = "#language.id")
    List<Framework> findByLanguage(FrameworkLanguage language);

    List<Framework> findByLanguage_Id(Long languageId);

    org.springframework.data.domain.Page<Framework> findByCategory(FrameworkCategory category, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Framework> findByCategory_Id(Long categoryId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Framework> findByLanguage(FrameworkLanguage language, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Framework> findByLanguage_Id(Long languageId, org.springframework.data.domain.Pageable pageable);
}
