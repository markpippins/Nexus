package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.OperatingSystem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OperatingSystemRepository extends JpaRepository<OperatingSystem, Long> {
    Optional<OperatingSystem> findByName(String name);

    List<OperatingSystem> findByNameContainingIgnoreCase(String name);

    org.springframework.data.domain.Page<OperatingSystem> findByNameContainingIgnoreCase(String name, org.springframework.data.domain.Pageable pageable);
}
