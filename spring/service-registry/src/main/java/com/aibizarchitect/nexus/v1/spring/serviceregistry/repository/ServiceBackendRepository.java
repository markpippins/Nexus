package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceBackend;

@Repository
public interface ServiceBackendRepository extends JpaRepository<ServiceBackend, Long> {

    /**
     * Find all backends for a service deployment by ID
     */
    List<ServiceBackend> findByServiceDeploymentId(Long serviceDeploymentId);

    /**
     * Find all service deployments that use a backend by ID
     */
    List<ServiceBackend> findByBackendDeploymentId(Long backendDeploymentId);

    /**
     * Find backends by role
     * Example: Find all PRIMARY backends for a service
     */
    List<ServiceBackend> findByServiceDeploymentIdAndRole(Long serviceDeploymentId, ServiceBackend.BackendRole role);

    /**
     * Find active backends for a service deployment, ordered by priority
     */
    List<ServiceBackend> findByServiceDeploymentIdAndIsActiveTrueOrderByPriorityAsc(Long serviceDeploymentId);

    /**
     * Find backends by routing key (for sharding)
     */
    List<ServiceBackend> findByServiceDeploymentIdAndRoutingKey(Long serviceDeploymentId, String routingKey);
}
