package com.angrysurfer.spring.nexus.admin.logging;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Document(collection = "admin_log_entries")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminLogEntry {

    @Id
    private UUID id;

    private LocalDateTime timestamp;

    private String serverId;

    private Integer serverPort;

    private String serverConfig;

    private String userId;

    private String service;

    private String operation;

    private String requestParams; // JSON or serialized form of parameters

    private Boolean successStatus;

    private String errorMessage;

    private String requestId;
}