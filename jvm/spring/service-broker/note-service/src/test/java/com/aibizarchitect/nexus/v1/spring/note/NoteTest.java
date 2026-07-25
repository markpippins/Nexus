package com.aibizarchitect.nexus.v1.spring.note;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Note")
class NoteTest {

    @Nested
    @DisplayName("construction")
    class Construction {

        @Test
        @DisplayName("default constructor creates empty note")
        void defaultConstructor() {
            Note note = new Note();

            assertNull(note.getId());
            assertNull(note.getUserId());
            assertNull(note.getContent());
        }

        @Test
        @DisplayName("four-arg constructor sets all fields")
        void fourArgConstructor() {
            Note note = new Note("user-1", "web", "settings", "{\"theme\":\"dark\"}");

            assertEquals("user-1", note.getUserId());
            assertEquals("web", note.getSource());
            assertEquals("settings", note.getKey());
            assertEquals("{\"theme\":\"dark\"}", note.getContent());
        }

        @Test
        @DisplayName("null fields allowed in four-arg constructor")
        void nullFields() {
            Note note = new Note(null, null, null, null);

            assertNull(note.getUserId());
            assertNull(note.getSource());
            assertNull(note.getKey());
            assertNull(note.getContent());
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class Accessors {

        @Test
        @DisplayName("id can be set and retrieved")
        void idAccessor() {
            Note note = new Note();
            note.setId("abc123");

            assertEquals("abc123", note.getId());
        }

        @Test
        @DisplayName("content can be updated")
        void contentUpdate() {
            Note note = new Note("u1", "s", "k", "old");
            note.setContent("new");

            assertEquals("new", note.getContent());
        }
    }
}
