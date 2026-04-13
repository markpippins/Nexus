package nexus.serviceregistry.v1.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import nexus.serviceregistry.v1.entity.EnvironmentType;
import nexus.serviceregistry.v1.entity.Host;
import nexus.serviceregistry.v1.entity.ServerType;

@Repository
public interface HostRepository extends JpaRepository<Host, Long> {
    Optional<Host> findByHostname(String hostname);
    List<Host> findByEnvironmentType(EnvironmentType environmentType);
    List<Host> findByEnvironmentType_Id(Long environmentTypeId);
    List<Host> findByStatus(String status);
    List<Host> findByType(ServerType serverType);
    List<Host> findByType_Id(Long serverTypeId);
    List<Host> findByCloudProvider(String cloudProvider);

    org.springframework.data.domain.Page<Host> findByEnvironmentType(EnvironmentType environmentType, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByEnvironmentType_Id(Long environmentTypeId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByStatus(String status, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByType(ServerType serverType, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByType_Id(Long serverTypeId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByCloudProvider(String cloudProvider, org.springframework.data.domain.Pageable pageable);
}
