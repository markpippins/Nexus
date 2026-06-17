package org.nexus.peb.store.repository;

import org.nexus.peb.domain.entity.PebCapability;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface PebCapabilityRepository extends JpaRepository<PebCapability, UUID> {
}
