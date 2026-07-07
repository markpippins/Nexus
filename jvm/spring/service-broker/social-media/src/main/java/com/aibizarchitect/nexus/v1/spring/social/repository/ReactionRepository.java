package com.aibizarchitect.nexus.v1.spring.social.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;

@Repository
public interface ReactionRepository extends JpaRepository<Reaction, UUID> {
}
