package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.EnvironmentType;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EnvironmentTypeRepository extends JpaRepository<EnvironmentType, Long> {
    @Cacheable(value = "environmentTypes", key = "#name")
    Optional<EnvironmentType> findByName(String name);

    @Cacheable(value = "environmentTypes", key = "'search:' + #name")
    List<EnvironmentType> findByNameContainingIgnoreCase(String name);
}
