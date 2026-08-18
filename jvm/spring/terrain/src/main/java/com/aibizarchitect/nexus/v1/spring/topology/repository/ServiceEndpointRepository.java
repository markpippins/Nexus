package com.aibizarchitect.nexus.v1.spring.topology.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aibizarchitect.nexus.v1.spring.topology.entity.ServiceEndpoint;

public interface ServiceEndpointRepository extends JpaRepository<ServiceEndpoint, UUID> {

    List<ServiceEndpoint> findByUnitOrderByInstanceAsc(String unit);

    Optional<ServiceEndpoint> findByUnitAndInstance(String unit, String instance);

    List<ServiceEndpoint> findByUnitIn(Collection<String> units);
}
