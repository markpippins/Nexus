package com.aibizarchitect.nexus.v1.spring.topology.repository;

import com.aibizarchitect.nexus.v1.spring.topology.entity.HostProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HostProfileRepository extends JpaRepository<HostProfile, Long> {
}
