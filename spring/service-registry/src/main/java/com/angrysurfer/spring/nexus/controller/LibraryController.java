package com.angrysurfer.spring.nexus.controller;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.entity.Library;
import com.angrysurfer.spring.nexus.repository.LibraryRepository;

@RestController
@RequestMapping("/api/v1/libraries")
@CrossOrigin(origins = "*")
public class LibraryController {

    private static final Logger log = LoggerFactory.getLogger(LibraryController.class);

    private final LibraryRepository libraryRepository;

    public LibraryController(LibraryRepository libraryRepository) {
        this.libraryRepository = libraryRepository;
    }

    @GetMapping
    public ResponseEntity<?> getLibraries(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Long languageId,
            @RequestParam(required = false) String packageManager,
            org.springframework.data.domain.Pageable pageable) {

        if (name != null) {
            log.info("Fetching library by name: {}", name);
            return libraryRepository.findByName(name)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else if (categoryId != null) {
            log.info("Fetching libraries by category ID: {}", categoryId);
            return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(libraryRepository.findByCategory_Id(categoryId, pageable)));
        } else if (languageId != null) {
            log.info("Fetching libraries by language ID: {}", languageId);
            return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(libraryRepository.findByLanguage_Id(languageId, pageable)));
        } else if (packageManager != null) {
            log.info("Fetching libraries by package manager: {}", packageManager);
            return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(libraryRepository.findByPackageManager(packageManager, pageable)));
        } else {
            log.info("Fetching all libraries");
            return ResponseEntity.ok(com.angrysurfer.spring.nexus.dto.SpringPagedResponse.fromPage(libraryRepository.findAll(pageable)));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Library> getLibraryById(@PathVariable Long id) {
        log.info("Fetching library by ID: {}", id);
        Optional<Library> library = libraryRepository.findById(id);
        return library.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
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
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(savedLibrary.getId())
                .toUri();
        return ResponseEntity.created(location).body(savedLibrary);
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
