package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;

@Repository
public interface ServerTypeRepository extends JpaRepository<ServerType, Long> {
    Optional<ServerType> findByName(String name);

    Optional<ServerType> findByNameIgnoreCase(String name);
}
