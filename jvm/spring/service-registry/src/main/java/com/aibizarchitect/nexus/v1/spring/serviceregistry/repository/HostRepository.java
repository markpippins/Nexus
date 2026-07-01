package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Host;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.HostType;

@Repository
public interface HostRepository extends JpaRepository<Host, Long> {
    Optional<Host> findByHostname(String hostname);
    List<Host> findByEnvironmentType(EnvironmentType environmentType);
    List<Host> findByEnvironmentType_Id(Long environmentTypeId);
    List<Host> findByStatus(String status);
    List<Host> findByType(HostType hostType);
    List<Host> findByType_Id(Long hostTypeId);
    List<Host> findByCloudProvider(String cloudProvider);

    org.springframework.data.domain.Page<Host> findByEnvironmentType(EnvironmentType environmentType, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByEnvironmentType_Id(Long environmentTypeId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByStatus(String status, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByType(HostType hostType, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByType_Id(Long hostTypeId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Host> findByCloudProvider(String cloudProvider, org.springframework.data.domain.Pageable pageable);
}
