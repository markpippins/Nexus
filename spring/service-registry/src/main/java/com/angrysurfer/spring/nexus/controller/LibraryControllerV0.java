package com.angrysurfer.spring.nexus.controller;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.entity.Library;
import com.angrysurfer.spring.nexus.repository.LibraryRepository;

@RestController
@RequestMapping("/api/v0/libraries")
@CrossOrigin(origins = "*")
public class LibraryControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(LibraryControllerV0.class);

    private final LibraryRepository libraryRepository;

    public LibraryControllerV0(LibraryRepository libraryRepository) {
        this.libraryRepository = libraryRepository;
    }

    @GetMapping
    public List<Library> getAllLibraries() {
        log.info("Fetching all libraries");
        return libraryRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Library> getLibraryById(@PathVariable Long id) {
        log.info("Fetching library by ID: {}", id);
        Optional<Library> library = libraryRepository.findById(id);
        return library.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{name}")
    public ResponseEntity<Library> getLibraryByName(@PathVariable String name) {
        log.info("Fetching library by name: {}", name);
        Optional<Library> library = libraryRepository.findByName(name);
        return library.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/category/{categoryId}")
    public List<Library> getLibrariesByCategory(@PathVariable Long categoryId) {
        log.info("Fetching libraries by category ID: {}", categoryId);
        return libraryRepository.findByCategory_Id(categoryId);
    }

    @GetMapping("/language/{languageId}")
    public List<Library> getLibrariesByLanguage(@PathVariable Long languageId) {
        log.info("Fetching libraries by language ID: {}", languageId);
        return libraryRepository.findByLanguage_Id(languageId);
    }

    @GetMapping("/package-manager/{packageManager}")
    public List<Library> getLibrariesByPackageManager(@PathVariable String packageManager) {
        log.info("Fetching libraries by package manager: {}", packageManager);
        return libraryRepository.findByPackageManager(packageManager);
    }

    @PostMapping
    public ResponseEntity<Library> createLibrary(@RequestBody Library library) {
        log.info("Creating new library: {}", library.getName());

        if (libraryRepository.findByName(library.getName()).isPresent()) {
            log.warn("Library with name {} already exists", library.getName());
            return ResponseEntity.badRequest().build();
        }

        library.setActiveFlag(true);
        Library savedLibrary = libraryRepository.save(library);
        log.info("Successfully created library with ID: {}", savedLibrary.getId());
        return ResponseEntity.ok(savedLibrary);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Library> updateLibrary(@PathVariable Long id, @RequestBody Library library) {
        log.info("Updating library with ID: {}", id);

        Optional<Library> existingLibraryOpt = libraryRepository.findById(id);
        if (existingLibraryOpt.isEmpty()) {
            log.warn("Library with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        Library existingLibrary = existingLibraryOpt.get();
        if (!existingLibrary.getName().equals(library.getName())) {
            if (libraryRepository.findByName(library.getName()).isPresent()) {
                log.warn("Library with name {} already exists", library.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        library.setId(id);
        Library updatedLibrary = libraryRepository.save(library);
        log.info("Successfully updated library with ID: {}", id);
        return ResponseEntity.ok(updatedLibrary);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteLibrary(@PathVariable Long id) {
        log.info("Deleting library with ID: {}", id);

        Optional<Library> libraryOpt = libraryRepository.findById(id);
        if (libraryOpt.isEmpty()) {
            log.warn("Library with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        libraryRepository.deleteById(id);
        log.info("Successfully deleted library with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
