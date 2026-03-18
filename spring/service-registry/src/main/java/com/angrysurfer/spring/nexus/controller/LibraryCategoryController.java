package com.angrysurfer.spring.nexus.controller;

import com.angrysurfer.spring.nexus.entity.LibraryCategory;
import com.angrysurfer.spring.nexus.repository.LibraryCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/library-categories")
@CrossOrigin(origins = "*")
public class LibraryCategoryController {

    private static final Logger log = LoggerFactory.getLogger(LibraryCategoryController.class);

    private final LibraryCategoryRepository libraryCategoryRepository;

    public LibraryCategoryController(LibraryCategoryRepository libraryCategoryRepository) {
        this.libraryCategoryRepository = libraryCategoryRepository;
    }

    @GetMapping
    public ResponseEntity<?> getLibraryCategories(
            @RequestParam(required = false) String name,
            org.springframework.data.domain.Pageable pageable) {
        if (name != null) {
            log.info("Fetching library category by name: {}", name);
            return libraryCategoryRepository.findByName(name)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else {
            log.info("Fetching all library categories");
            return ResponseEntity.ok(libraryCategoryRepository.findAll(pageable));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<LibraryCategory> getLibraryCategoryById(@PathVariable Long id) {
        log.info("Fetching library category by ID: {}", id);
        Optional<LibraryCategory> category = libraryCategoryRepository.findById(id);
        return category.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<LibraryCategory> createLibraryCategory(@RequestBody LibraryCategory category) {
        log.info("Creating new library category: {}", category.getName());

        if (libraryCategoryRepository.findByName(category.getName()).isPresent()) {
            log.warn("Library category with name {} already exists", category.getName());
            return ResponseEntity.badRequest().build();
        }

        category.setActiveFlag(true);
        LibraryCategory savedCategory = libraryCategoryRepository.save(category);
        log.info("Successfully created library category with ID: {}", savedCategory.getId());
        java.net.URI location = org.springframework.web.servlet.support.ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(savedCategory.getId())
                .toUri();
        return ResponseEntity.created(location).body(savedCategory);
    }

    @PutMapping("/{id}")
    public ResponseEntity<LibraryCategory> updateLibraryCategory(@PathVariable Long id,
            @RequestBody LibraryCategory category) {
        log.info("Updating library category with ID: {}", id);

        Optional<LibraryCategory> existingCategoryOpt = libraryCategoryRepository.findById(id);
        if (existingCategoryOpt.isEmpty()) {
            log.warn("Library category with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        LibraryCategory existingCategory = existingCategoryOpt.get();
        if (!existingCategory.getName().equals(category.getName())) {
            if (libraryCategoryRepository.findByName(category.getName()).isPresent()) {
                log.warn("Library category with name {} already exists", category.getName());
                return ResponseEntity.badRequest().build();
            }
        }

        category.setId(id);
        LibraryCategory updatedCategory = libraryCategoryRepository.save(category);
        log.info("Successfully updated library category with ID: {}", id);
        return ResponseEntity.ok(updatedCategory);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteLibraryCategory(@PathVariable Long id) {
        log.info("Deleting library category with ID: {}", id);

        Optional<LibraryCategory> categoryOpt = libraryCategoryRepository.findById(id);
        if (categoryOpt.isEmpty()) {
            log.warn("Library category with ID {} not found", id);
            return ResponseEntity.notFound().build();
        }

        libraryCategoryRepository.deleteById(id);
        log.info("Successfully deleted library category with ID: {}", id);
        return ResponseEntity.noContent().build();
    }
}
