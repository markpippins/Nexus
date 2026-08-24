package com.aibizarchitect.nexus.v1.spring.topology.repository;

import com.aibizarchitect.nexus.v1.spring.topology.entity.RunnableService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RunnableServiceRepository extends JpaRepository<RunnableService, Long> {

    /**
     * Name-keyed lookup used by the create-or-update POST handler.
     * Backed by the {@code runnable_services_name_key} UNIQUE (name) constraint.
     */
    Optional<RunnableService> findByName(String name);
}
