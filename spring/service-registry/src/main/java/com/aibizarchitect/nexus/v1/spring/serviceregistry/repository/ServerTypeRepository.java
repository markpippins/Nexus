package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import java.util.Optional;

public interface ServerTypeRepository extends JpaRepository<ServerType, Long> {
    @Cacheable(value = "serverTypes", key = "#name")
    Optional<ServerType> findByName(String name);
}
