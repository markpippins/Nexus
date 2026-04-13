package nexus.serviceregistry.v1.repository;

import nexus.serviceregistry.v1.entity.ServiceConfigType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ServiceConfigTypeRepository extends JpaRepository<ServiceConfigType, Long> {
    Optional<ServiceConfigType> findByName(String name);
}
