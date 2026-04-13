package nexus.serviceregistry.v1.repository;

import nexus.serviceregistry.v1.entity.ServiceDependency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ServiceDependencyRepository extends JpaRepository<ServiceDependency, Long> {
    List<ServiceDependency> findByServiceId(Long serviceId);
    List<ServiceDependency> findByTargetServiceId(Long targetServiceId);
    List<ServiceDependency> findByServiceIdAndTargetServiceId(Long serviceId, Long targetServiceId);
}
