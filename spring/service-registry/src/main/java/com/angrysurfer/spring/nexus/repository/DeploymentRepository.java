package com.angrysurfer.spring.nexus.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.entity.Deployment;
import com.angrysurfer.spring.nexus.entity.EnvironmentType;
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.entity.Service;

@Repository
public interface DeploymentRepository extends JpaRepository<Deployment, Long> {
    List<Deployment> findByService(Service service);
    List<Deployment> findByService_Id(Long serviceId);
    List<Deployment> findByServer(Host server);
    List<Deployment> findByServer_Id(Long serverId);
    List<Deployment> findByStatus(String status);
    List<Deployment> findByEnvironment(EnvironmentType environment);
    List<Deployment> findByEnvironment_Id(Long environmentId);
    List<Deployment> findByServiceAndEnvironment(Service service, EnvironmentType environment);

    org.springframework.data.domain.Page<Deployment> findByService(Service service, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByService_Id(Long serviceId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByServer(Host server, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByServer_Id(Long serverId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByStatus(String status, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByEnvironment(EnvironmentType environment, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByEnvironment_Id(Long environmentId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Deployment> findByServiceAndEnvironment(Service service, EnvironmentType environment, org.springframework.data.domain.Pageable pageable);

    // Backward-compatible aliases
    default List<Deployment> findByServiceId(Long serviceId) {
        return findByService_Id(serviceId);
    }

    default List<Deployment> findByServerId(Long serverId) {
        return findByServer_Id(serverId);
    }

    default List<Deployment> findByEnvironmentId(Long environmentId) {
        return findByEnvironment_Id(environmentId);
    }
}
