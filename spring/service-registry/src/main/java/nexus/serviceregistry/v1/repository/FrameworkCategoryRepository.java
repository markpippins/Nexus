package nexus.serviceregistry.v1.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import nexus.serviceregistry.v1.entity.FrameworkCategory;
import java.util.Optional;

public interface FrameworkCategoryRepository extends JpaRepository<FrameworkCategory, Long> {
    @Cacheable(value = "frameworkCategories", key = "#name")
    Optional<FrameworkCategory> findByName(String name);
}
