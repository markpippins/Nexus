package com.aibizarchitect.nexus.v1.spring.social.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.aibizarchitect.nexus.v1.spring.social.model.Profile;

@Repository
public interface ProfileRepository extends JpaRepository<Profile, UUID> {

    Optional<Profile> findByUser_Id(UUID userId);

    @Transactional
    void deleteByUser_Id(UUID userId);
}
