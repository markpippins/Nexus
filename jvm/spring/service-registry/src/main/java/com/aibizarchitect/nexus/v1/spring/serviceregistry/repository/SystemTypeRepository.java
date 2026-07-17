package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SystemTypeRepository extends JpaRepository<SystemType, Long> {

    Optional<SystemType> findByName(String name);

    boolean existsByName(String name);
}
