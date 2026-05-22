package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.EnvironmentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EnvironmentTypeRepository extends JpaRepository<EnvironmentType, Long> {
    Optional<EnvironmentType> findByName(String name);

    List<EnvironmentType> findByNameContainingIgnoreCase(String name);
}
