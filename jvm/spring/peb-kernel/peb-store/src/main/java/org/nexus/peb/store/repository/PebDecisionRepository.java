package org.nexus.peb.store.repository;

import org.nexus.peb.domain.entity.PebDecision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PebDecisionRepository extends JpaRepository<PebDecision, UUID> {
}
