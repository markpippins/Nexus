package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkType;

@Repository
public interface FrameworkTypeRepository extends JpaRepository<FrameworkType, Long> {
    Optional<FrameworkType> findByName(String name);

    Optional<FrameworkType> findByNameIgnoreCase(String name);
}
