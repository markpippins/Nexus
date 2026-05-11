package com.aibizarchitect.nexus.v1.spring.repository;

import java.util.UUID;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.admin.logging.AdminLogEntry;

@Repository
public interface AdminLogRepository extends MongoRepository<AdminLogEntry, UUID> {
    // Additional custom queries can be added here if needed
}