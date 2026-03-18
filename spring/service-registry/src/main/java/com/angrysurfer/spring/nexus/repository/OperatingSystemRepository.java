package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.OperatingSystem;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OperatingSystemRepository extends JpaRepository<OperatingSystem, Long> {
    @Cacheable(value = "operatingSystems", key = "#name")
    Optional<OperatingSystem> findByName(String name);

    @Cacheable(value = "operatingSystems", key = "'search:' + #name")
    List<OperatingSystem> findByNameContainingIgnoreCase(String name);
}
