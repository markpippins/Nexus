package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.VisualComponent;

@Repository
public interface VisualComponentRepository extends JpaRepository<VisualComponent, Long> {
    Optional<VisualComponent> findByType(String type);
}
