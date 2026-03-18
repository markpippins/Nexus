package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.Library;
import com.angrysurfer.spring.nexus.repository.LibraryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LibraryControllerTest {

    @Mock
    private LibraryRepository libraryRepository;

    @InjectMocks
    private LibraryController libraryController;

    private Library testLibrary;

    @BeforeEach
    void setUp() {
        org.springframework.mock.web.MockHttpServletRequest request = new org.springframework.mock.web.MockHttpServletRequest();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        testLibrary = new Library();
        testLibrary.setId(1L);
        testLibrary.setName("Lodash");
        testLibrary.setPackageName("lodash");
        testLibrary.setActiveFlag(true);
    }

    @Test
    void getLibraries_ByName_Found() {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.of(testLibrary));

        ResponseEntity<?> response = libraryController.getLibraries("Lodash", null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testLibrary, response.getBody());
        verify(libraryRepository).findByName("Lodash");
    }

    @Test
    void getLibraries_ByName_NotFound() {
        when(libraryRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        ResponseEntity<?> response = libraryController.getLibraries("Nonexistent", null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getLibraries_ByCategoryId() {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByCategory_Id(eq(1L), any(Pageable.class))).thenReturn(libraryPage);

        ResponseEntity<?> response = libraryController.getLibraries(null, 1L, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(libraryRepository).findByCategory_Id(eq(1L), any(Pageable.class));
    }

    @Test
    void getLibraries_ByLanguageId() {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByLanguage_Id(eq(1L), any(Pageable.class))).thenReturn(libraryPage);

        ResponseEntity<?> response = libraryController.getLibraries(null, null, 1L, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(libraryRepository).findByLanguage_Id(eq(1L), any(Pageable.class));
    }

    @Test
    void getLibraries_ByPackageManager() {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByPackageManager(eq("npm"), any(Pageable.class))).thenReturn(libraryPage);

        ResponseEntity<?> response = libraryController.getLibraries(null, null, null, "npm", PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(libraryRepository).findByPackageManager(eq("npm"), any(Pageable.class));
    }

    @Test
    void getLibraries_All() {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findAll(any(Pageable.class))).thenReturn(libraryPage);

        ResponseEntity<?> response = libraryController.getLibraries(null, null, null, null, PageRequest.of(0, 10));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(libraryRepository).findAll(any(Pageable.class));
    }

    @Test
    void getLibraryById_Found() {
        when(libraryRepository.findById(1L)).thenReturn(Optional.of(testLibrary));

        ResponseEntity<Library> response = libraryController.getLibraryById(1L);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testLibrary, response.getBody());
    }

    @Test
    void getLibraryById_NotFound() {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Library> response = libraryController.getLibraryById(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void createLibrary_Success() {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.empty());
        when(libraryRepository.save(any(Library.class))).thenReturn(testLibrary);

        ResponseEntity<Library> response = libraryController.createLibrary(testLibrary);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().getActiveFlag());
        verify(libraryRepository).save(any(Library.class));
    }

    @Test
    void createLibrary_DuplicateName() {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.of(testLibrary));

        ResponseEntity<Library> response = libraryController.createLibrary(testLibrary);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(libraryRepository, never()).save(any(Library.class));
    }

    @Test
    void updateLibrary_Success() {
        Library existingLibrary = new Library();
        existingLibrary.setId(1L);
        existingLibrary.setName("Old Library");

        Library updatedLibrary = new Library();
        updatedLibrary.setName("New Library");

        when(libraryRepository.findById(1L)).thenReturn(Optional.of(existingLibrary));
        when(libraryRepository.findByName("New Library")).thenReturn(Optional.empty());
        when(libraryRepository.save(any(Library.class))).thenReturn(updatedLibrary);

        ResponseEntity<Library> response = libraryController.updateLibrary(1L, updatedLibrary);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(libraryRepository).save(any(Library.class));
    }

    @Test
    void updateLibrary_NotFound() {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Library> response = libraryController.updateLibrary(1L, testLibrary);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(libraryRepository, never()).save(any(Library.class));
    }

    @Test
    void updateLibrary_DuplicateName() {
        Library existingLibrary = new Library();
        existingLibrary.setId(1L);
        existingLibrary.setName("Old Library");

        Library updatedLibrary = new Library();
        updatedLibrary.setName("Existing Library");

        when(libraryRepository.findById(1L)).thenReturn(Optional.of(existingLibrary));
        when(libraryRepository.findByName("Existing Library")).thenReturn(Optional.of(new Library()));

        ResponseEntity<Library> response = libraryController.updateLibrary(1L, updatedLibrary);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void deleteLibrary_Success() {
        when(libraryRepository.findById(1L)).thenReturn(Optional.of(testLibrary));
        doNothing().when(libraryRepository).deleteById(1L);

        ResponseEntity<Void> response = libraryController.deleteLibrary(1L);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(libraryRepository).deleteById(1L);
    }

    @Test
    void deleteLibrary_NotFound() {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        ResponseEntity<Void> response = libraryController.deleteLibrary(1L);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(libraryRepository, never()).deleteById(anyLong());
    }
}
