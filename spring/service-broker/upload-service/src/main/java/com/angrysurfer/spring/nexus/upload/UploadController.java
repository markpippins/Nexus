package com.angrysurfer.spring.nexus.upload;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.angrysurfer.spring.nexus.broker.Broker;
import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/upload")
public class UploadController {

    private static final Logger log = LoggerFactory.getLogger(UploadController.class);

    private final UploadService uploadService;
    private final Broker broker;

    public UploadController(UploadService uploadService, Broker broker) {
        this.uploadService = uploadService;
        this.broker = broker;
        log.info("UploadController initialized");
    }

    @PostMapping(value = "/submitRequestWithFile", consumes = {"multipart/form-data"})
    public ResponseEntity<?> submitRequestWithFile(
            @RequestParam("service") String service,
            @RequestParam("operation") String operation,
            @RequestParam(value = "params", required = false) String paramsJson,
            @RequestParam("requestId") String requestId,
            @RequestPart("file") MultipartFile file) {

        log.info("Received file upload for service: {}, operation: {}, file: {}", service, operation, file.getOriginalFilename());

        Map<String, Object> params = new HashMap<>();
        if (paramsJson != null) {
            try {
                params = new ObjectMapper().readValue(paramsJson, Map.class);
                log.debug("Parsed params: {}", params);
            } catch (IOException e) {
                log.error("Invalid params JSON: {}", paramsJson, e);
                return ResponseEntity.badRequest().body("Invalid params JSON");
            }
        }
        ServiceResponse<?> response;

        try {
            Path path = uploadService.saveUploadedFile(file);
            params.put("filePath", path);
            log.info("File saved at: {}", path);
            response = broker.submit(new ServiceRequest(service, operation, params, requestId));
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            log.error("Error saving file: {}", file.getOriginalFilename(), e);
            return ResponseEntity.badRequest().body("Error saving file");
        }
    }
}
