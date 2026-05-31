package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.HostType;
import java.util.Optional;

public interface HostTypeRepository extends JpaRepository<HostType, Long> {
    Optional<HostType> findByName(String name);
}
