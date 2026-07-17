package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.LibraryType;

@Repository
public interface LibraryTypeRepository extends JpaRepository<LibraryType, Long> {
    Optional<LibraryType> findByName(String name);

    Optional<LibraryType> findByNameIgnoreCase(String name);
}
