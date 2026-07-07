package com.aibizarchitect.nexus.v1.spring.social.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.social.model.Forum;

@Repository
public interface ForumRepository extends JpaRepository<Forum, UUID> {

    Optional<Forum> findByName(String name);
}
