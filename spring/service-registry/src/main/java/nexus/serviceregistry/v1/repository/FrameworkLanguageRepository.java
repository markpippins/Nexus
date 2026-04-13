package nexus.serviceregistry.v1.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import nexus.serviceregistry.v1.entity.FrameworkLanguage;
import java.util.Optional;

public interface FrameworkLanguageRepository extends JpaRepository<FrameworkLanguage, Long> {
    @Cacheable(value = "frameworkLanguages", key = "#name")
    Optional<FrameworkLanguage> findByName(String name);
}
