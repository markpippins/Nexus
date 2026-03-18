package com.angrysurfer.spring.nexus.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.entity.EnvironmentType;
import com.angrysurfer.spring.nexus.entity.Host;
import com.angrysurfer.spring.nexus.entity.ServerType;

@Repository
public interface HostRepository extends JpaRepository<Host, Long> {
    Optional<Host> findByHostname(String hostname);
    List<Host> findByEnvironmentType(EnvironmentType environmentType);
    List<Host> findByEnvironmentType_Id(Long environmentTypeId);
    List<Host> findByStatus(String status);
    List<Host> findByType(ServerType serverType);
    List<Host> findByType_Id(Long serverTypeId);
    List<Host> findByCloudProvider(String cloudProvider);
}
