package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.FrameworkVendor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FrameworkVendorRepository extends JpaRepository<FrameworkVendor, Long> {
    Optional<FrameworkVendor> findByName(String name);
}
