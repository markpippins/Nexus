package com.aibizarchitect.nexus.v1.spring.service;

import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.admin.logging.AdminLogEntry;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.spring.repository.AdminLogRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class AdminLoggingService {

    private final AdminLogRepository adminLogRepository;

    @Value("${server.port:8080}")
    private int serverPort;

    @Value("${server.servlet.context-path:/}")
    private String serverContextPath;

    @Value("${spring.application.name:unknown}")
    private String serverName;

    public AdminLogEntry logRequest(ServiceRequest request, String userId) {
        try {
            AdminLogEntry logEntry = AdminLogEntry.builder()
                    .timestamp(LocalDateTime.now())
                    .serverId(serverName)
                    .serverPort(serverPort)
                    .serverConfig(serverContextPath)
                    .userId(userId)
                    .service(request.getService())
                    .operation(request.getOperation())
                    .requestParams(request.getParams() != null ? request.getParams().toString() : null)
                    .successStatus(null) // Will be updated later
                    .errorMessage(null) // Will be updated later
                    .requestId(request.getRequestId())
                    .build();

            return adminLogRepository.save(logEntry);
        } catch (Exception e) {
            log.error("Error logging request: {}", e.getMessage(), e);
            return null;
        }
    }

    public void updateLogEntry(UUID logId, Boolean successStatus, String errorMessage) {
        try {
            if (logId == null) {
                return;
            }

            AdminLogEntry logEntry = adminLogRepository.findById(logId)
                    .orElse(null);

            if (logEntry != null) {
                logEntry.setSuccessStatus(successStatus);
                if (errorMessage != null) {
                    logEntry.setErrorMessage(errorMessage);
                }
                adminLogRepository.save(logEntry);
            }
        } catch (Exception e) {
            log.error("Error updating log entry: {}", e.getMessage(), e);
        }
    }
}
