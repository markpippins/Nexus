package nexus.serviceregistry.v1.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import nexus.serviceregistry.v1.entity.ServiceType;
import java.util.Optional;

public interface ServiceTypeRepository extends JpaRepository<ServiceType, Long> {
    @Cacheable(value = "serviceTypes", key = "#name")
    Optional<ServiceType> findByName(String name);
}
