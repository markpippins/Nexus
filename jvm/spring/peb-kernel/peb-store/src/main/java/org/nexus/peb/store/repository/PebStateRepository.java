package org.nexus.peb.store.repository;

import org.nexus.peb.domain.entity.PebState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PebStateRepository extends JpaRepository<PebState, UUID> {
    Optional<PebState> findByKey(String key);
}
