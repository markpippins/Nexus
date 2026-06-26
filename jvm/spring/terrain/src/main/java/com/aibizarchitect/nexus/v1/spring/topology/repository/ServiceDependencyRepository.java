package com.aibizarchitect.nexus.v1.spring.topology.repository;

import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceDependency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ServiceDependencyRepository extends JpaRepository<ServiceDependency, Long> {
    List<ServiceDependency> findBySourceTypeAndSourceId(String sourceType, Long sourceId);
    List<ServiceDependency> findByTargetTypeAndTargetId(String targetType, Long targetId);
}
