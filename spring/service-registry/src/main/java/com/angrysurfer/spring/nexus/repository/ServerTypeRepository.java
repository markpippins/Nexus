package com.angrysurfer.spring.nexus.repository;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.angrysurfer.spring.nexus.entity.ServerType;
import java.util.Optional;

public interface ServerTypeRepository extends JpaRepository<ServerType, Long> {
    @Cacheable(value = "serverTypes", key = "#name")
    Optional<ServerType> findByName(String name);
}
