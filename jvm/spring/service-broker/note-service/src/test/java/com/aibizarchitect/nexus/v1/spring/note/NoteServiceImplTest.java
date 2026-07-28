package com.aibizarchitect.nexus.v1.spring.note;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NoteServiceImpl")
class NoteServiceImplTest {

    @Mock
    private NoteRepository noteRepository;

    @InjectMocks
    private NoteServiceImpl noteService;

    private static final String USER_ID = "user-1";
    private static final String SOURCE = "web";
    private static final String KEY = "settings";

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — successful operations")
    class GreenPath {

        @Test
        @DisplayName("saveNote: creates new note when none exists")
        void saveNote_createsNew() {
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.empty());
            Note saved = new Note(USER_ID, SOURCE, KEY, "content");
            saved.setId("new-id");
            when(noteRepository.save(any(Note.class))).thenReturn(saved);

            Note result = noteService.saveNote(USER_ID, SOURCE, KEY, "content");

            assertEquals("content", result.getContent());
            assertEquals("new-id", result.getId());
        }

        @Test
        @DisplayName("saveNote: updates existing note when found")
        void saveNote_updatesExisting() {
            Note existing = new Note(USER_ID, SOURCE, KEY, "old-content");
            existing.setId("existing-id");
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.of(existing));
            when(noteRepository.save(any(Note.class))).thenReturn(existing);

            Note result = noteService.saveNote(USER_ID, SOURCE, KEY, "new-content");

            assertEquals("new-content", result.getContent());
            verify(noteRepository).save(existing);
        }

        @Test
        @DisplayName("getNote: returns note when found")
        void getNote_returnsNote() {
            Note note = new Note(USER_ID, SOURCE, KEY, "content");
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.of(note));

            Optional<Note> result = noteService.getNote(USER_ID, SOURCE, KEY);

            assertTrue(result.isPresent());
            assertEquals("content", result.get().getContent());
        }

        @Test
        @DisplayName("getNote: returns empty when not found")
        void getNote_returnsEmpty() {
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.empty());

            Optional<Note> result = noteService.getNote(USER_ID, SOURCE, KEY);

            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("deleteNote: returns true when note exists and is deleted")
        void deleteNote_success() {
            Note note = new Note(USER_ID, SOURCE, KEY, "content");
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.of(note));

            boolean result = noteService.deleteNote(USER_ID, SOURCE, KEY);

            assertTrue(result);
            verify(noteRepository).deleteByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY);
        }

        @Test
        @DisplayName("deleteNote: returns false when note not found")
        void deleteNote_notFound() {
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.empty());

            boolean result = noteService.deleteNote(USER_ID, SOURCE, KEY);

            assertFalse(result);
            verify(noteRepository, never()).deleteByUserIdAndSourceAndKey(any(), any(), any());
        }

        @Test
        @DisplayName("getNotesByUserId: returns user notes")
        void getNotesByUserId() {
            when(noteRepository.findByUserId(USER_ID))
                    .thenReturn(List.of(
                            new Note(USER_ID, "web", "k1", "c1"),
                            new Note(USER_ID, "mobile", "k2", "c2")));

            List<Note> notes = noteService.getNotesByUserId(USER_ID);

            assertEquals(2, notes.size());
        }

        @Test
        @DisplayName("getNotesByUserIdAndSource: returns filtered notes")
        void getNotesByUserIdAndSource() {
            when(noteRepository.findByUserIdAndSource(USER_ID, "web"))
                    .thenReturn(List.of(new Note(USER_ID, "web", "k1", "c1")));

            List<Note> notes = noteService.getNotesByUserIdAndSource(USER_ID, "web");

            assertEquals(1, notes.size());
            assertEquals("web", notes.get(0).getSource());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases")
    class OrangePath {

        @Test
        @DisplayName("saveNote: null content is allowed")
        void saveNote_nullContent() {
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.empty());
            Note saved = new Note(USER_ID, SOURCE, KEY, null);
            when(noteRepository.save(any(Note.class))).thenReturn(saved);

            Note result = noteService.saveNote(USER_ID, SOURCE, KEY, null);

            assertNull(result.getContent());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions")
    class RedPath {

        @Test
        @DisplayName("saveNote: repository exception propagates")
        void saveNote_repositoryException() {
            when(noteRepository.findByUserIdAndSourceAndKey(USER_ID, SOURCE, KEY))
                    .thenReturn(Optional.empty());
            when(noteRepository.save(any(Note.class)))
                    .thenThrow(new RuntimeException("DB error"));

            assertThrows(RuntimeException.class,
                    () -> noteService.saveNote(USER_ID, SOURCE, KEY, "content"));
        }
    }
}
