package com.angrysurfer.spring.nexus.admin.logging.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.admin.logging.AdminLogEntry;

import java.util.UUID;

@Repository
public interface AdminLogRepository extends MongoRepository<AdminLogEntry, UUID> {
    // Additional custom queries can be added here if needed
}