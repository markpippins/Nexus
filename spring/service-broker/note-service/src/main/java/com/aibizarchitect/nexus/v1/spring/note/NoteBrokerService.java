package com.aibizarchitect.nexus.v1.spring.note;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;

@Service("noteService")
public class NoteBrokerService {

    private static final Logger log = LoggerFactory.getLogger(NoteBrokerService.class);

    private final NoteServiceImpl noteService;
    private final NoteTokenService noteTokenService;

    public NoteBrokerService(NoteServiceImpl noteService, NoteTokenService noteTokenService) {
        this.noteService = noteService;
        this.noteTokenService = noteTokenService;
        log.info("NoteBrokerService initialized");
    }

    @BrokerOperation("getNote")
    public Note getNote(@BrokerParam("token") String token,
                        @BrokerParam("source") String source,
                        @BrokerParam("key") String key) {
        String userId = noteTokenService.getUserIdFromToken(token);
        if (userId == null) {
            log.warn("Invalid or expired token provided for getNote operation");
            return null;
        }
        return noteService.getNote(userId, source, key).orElse(null);
    }

    @BrokerOperation("saveNote")
    public Note saveNote(@BrokerParam("token") String token,
                         @BrokerParam("source") String source,
                         @BrokerParam("key") String key,
                         @BrokerParam("content") String content) {
        String userId = noteTokenService.getUserIdFromToken(token);
        if (userId == null) {
            log.warn("Invalid or expired token provided for saveNote operation");
            return null;
        }
        return noteService.saveNote(userId, source, key, content);
    }

    @BrokerOperation("deleteNote")
    public boolean deleteNote(@BrokerParam("token") String token,
                              @BrokerParam("source") String source,
                              @BrokerParam("key") String key) {
        String userId = noteTokenService.getUserIdFromToken(token);
        if (userId == null) {
            log.warn("Invalid or expired token provided for deleteNote operation");
            return false;
        }
        return noteService.deleteNote(userId, source, key);
    }

    // Additional useful operations
    @BrokerOperation("getNotesByToken")
    public List<Note> getNotesByToken(@BrokerParam("token") String token) {
        String userId = noteTokenService.getUserIdFromToken(token);
        if (userId == null) {
            log.warn("Invalid or expired token provided for getNotesByToken operation");
            return List.of();
        }
        return noteService.getNotesByUserId(userId);
    }

    @BrokerOperation("getNotesByTokenAndSource")
    public List<Note> getNotesByTokenAndSource(@BrokerParam("token") String token,
                                               @BrokerParam("source") String source) {
        String userId = noteTokenService.getUserIdFromToken(token);
        if (userId == null) {
            log.warn("Invalid or expired token provided for getNotesByTokenAndSource operation");
            return List.of();
        }
        return noteService.getNotesByUserIdAndSource(userId, source);
    }
}