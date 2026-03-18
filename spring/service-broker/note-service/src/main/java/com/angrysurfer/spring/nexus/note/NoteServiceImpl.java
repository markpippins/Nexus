package com.angrysurfer.spring.nexus.note;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class NoteServiceImpl {

    private static final Logger log = LoggerFactory.getLogger(NoteServiceImpl.class);

    private final NoteRepository noteRepository;

    public NoteServiceImpl(NoteRepository noteRepository) {
        this.noteRepository = noteRepository;
        log.info("NoteServiceImpl initialized");
    }

    public Optional<Note> getNote(String userId, String source, String key) {
        return noteRepository.findByUserIdAndSourceAndKey(userId, source, key);
    }

    public Note saveNote(String userId, String source, String key, String content) {
        // Check if a note with the same userId, source, and key already exists
        Optional<Note> existingNote = noteRepository.findByUserIdAndSourceAndKey(userId, source, key);
        
        if (existingNote.isPresent()) {
            // Update the existing note
            Note note = existingNote.get();
            note.setContent(content);
            log.debug("Updating existing note for userId: {}, source: {}, key: {}", userId, source, key);
            return noteRepository.save(note);
        } else {
            // Create a new note
            Note note = new Note(userId, source, key, content);
            log.debug("Creating new note for userId: {}, source: {}, key: {}", userId, source, key);
            return noteRepository.save(note);
        }
    }

    public boolean deleteNote(String userId, String source, String key) {
        Optional<Note> note = noteRepository.findByUserIdAndSourceAndKey(userId, source, key);
        if (note.isPresent()) {
            noteRepository.deleteByUserIdAndSourceAndKey(userId, source, key);
            log.debug("Deleted note for userId: {}, source: {}, key: {}", userId, source, key);
            return true;
        }
        log.debug("Note not found for deletion - userId: {}, source: {}, key: {}", userId, source, key);
        return false;
    }

    public List<Note> getNotesByUserId(String userId) {
        return noteRepository.findByUserId(userId);
    }

    public List<Note> getNotesByUserIdAndSource(String userId, String source) {
        return noteRepository.findByUserIdAndSource(userId, source);
    }
}