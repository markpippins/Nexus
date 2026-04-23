package com.aibizarchitect.nexus.v1.spring.upload;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;

@Service
public class UploadService {

    private static final Logger log = LoggerFactory.getLogger(UploadService.class);

    private final FileStorageProperties properties;

    public UploadService(FileStorageProperties properties) {
        this.properties = properties;
        // ensure directories exist
        createDirectoryIfNotExists(properties.getIncomingDir());
        createDirectoryIfNotExists(properties.getProcessedDir());
        createDirectoryIfNotExists(properties.getLogDir());
        log.info("FileService initialized with properties: {}", properties);
    }

    private void createDirectoryIfNotExists(String dir) {
        Path path = Paths.get(dir);
        if (!Files.exists(path)) {
            log.info("Creating directory: {}", dir);
            try {
                Files.createDirectories(path);
                log.info("Created directory: {}", dir);
            } catch (IOException e) {
                log.error("Could not create directory: {}", dir, e);
                throw new RuntimeException("Could not create directory: " + dir, e);
            }
        }
    }

    public Path saveUploadedFile(MultipartFile file) throws IOException {
        String target = Paths.get(properties.getIncomingDir(), file.getOriginalFilename()).toString();
        Path destination = Paths.get(target);
        log.info("Saving uploaded file to: {}", destination);
        file.transferTo(destination);
        return destination;
    }

    @BrokerOperation("processFile")
    public String processFile(Path filePath) {
        log.info("Processing file: {}", filePath);
        if (!Files.exists(filePath)) {
            log.error("File not found: {}", filePath);
            throw new IllegalArgumentException("File not found: " + filePath);
        }

        if (filePath.getFileName().toString().toLowerCase().endsWith(".log")) {
            try {
                Path logPath = Files.copy(filePath, Paths.get(properties.getLogDir(), filePath.getFileName().toString()));
                if (logPath != null && Files.exists(logPath)) {
                    Files.delete(filePath);
                    log.info("Moved log file to log dir and deleted original: {}", logPath);
                }

                List<String> keywords = List.of("ERROR", "FAILURE", "EXCEPTION");
                List<LogError> errors = LogParser.parseLogFile(logPath, keywords);

                errors.forEach(error -> log.warn("Log error found: {}", error));
                return logPath != null ? logPath.toString() : null;
            } catch (IOException e) {
                log.error("Error processing log file: {}", filePath, e);
                e.printStackTrace();
            }
        }

        return filePath.toString();
    }

    public Path moveToProcessed(Path filePath) throws IOException {
        Path target = Paths.get(properties.getProcessedDir(), filePath.getFileName().toString());
        log.info("Moving file to processed: {} -> {}", filePath, target);
        return Files.move(filePath, target);
    }

    /**
     * Convenience method: save, process, and move
     */
    public Path saveProcessAndMove(MultipartFile file) throws IOException {
        log.info("Saving, processing, and moving file: {}", file.getOriginalFilename());
        Path saved = saveUploadedFile(file);
        processFile(saved);
        return moveToProcessed(saved);
    }
}
