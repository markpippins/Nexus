package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.FrameworkVendor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FrameworkVendorRepository extends JpaRepository<FrameworkVendor, Long> {
    Optional<FrameworkVendor> findByName(String name);
}
