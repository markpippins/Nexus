package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.ServerType;
import java.util.Optional;

public interface ServerTypeRepository extends JpaRepository<ServerType, Long> {
    Optional<ServerType> findByName(String name);
}
