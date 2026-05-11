package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServiceType;
import java.util.Optional;

public interface ServiceTypeRepository extends JpaRepository<ServiceType, Long> {
    @Cacheable(value = "serviceTypes", key = "#name")
    Optional<ServiceType> findByName(String name);
}
