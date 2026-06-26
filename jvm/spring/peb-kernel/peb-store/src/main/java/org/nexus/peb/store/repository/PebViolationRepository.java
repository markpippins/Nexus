package org.nexus.peb.store.repository;

import org.nexus.peb.domain.entity.PebViolation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PebViolationRepository extends JpaRepository<PebViolation, UUID> {
}
