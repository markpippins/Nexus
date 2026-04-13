package nexus.serviceregistry.v1.controller;

import nexus.serviceregistry.v1.entity.LibraryCategory;
import nexus.serviceregistry.v1.repository.LibraryCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/v0/library-categories")
@CrossOrigin(origins = "*")
@Deprecated(since = "v1", forRemoval = true)
public class LibraryCategoryControllerV0 {

    private static final Logger log = LoggerFactory.getLogger(LibraryCategoryControllerV0.class);

    private final LibraryCategoryRepository libraryCategoryRepository;

    public LibraryCategoryControllerV0(LibraryCategoryRepository libraryCategoryRepository) {
        this.libraryCategoryRepository = libraryCategoryRepository;
    }

    @GetMapping
    @Deprecated(since = "v1", forRemoval = true)
    public List<LibraryCategory> getAllLibraryCategories() {
        log.info("Fetching all library categories");
        return libraryCategoryRepository.findAll();
    }

    @GetMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<LibraryCategory> getLibraryCategoryById(@PathVariable Long id) {
        log.info("Fetching library category by ID: {}", id);
        Optional<LibraryCategory> category = libraryCategoryRepository.findById(id);
        return category.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/name/{name}")
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<LibraryCategory> getLibraryCategoryByName(@PathVariable String name) {
        log.info("Fetching library category by name: {}", name);
        Optional<LibraryCategory> category = libraryCategoryRepository.findByName(name);
        return category.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Deprecated(since = "v1", forRemoval = true)
    public ResponseEntity<LibraryCategory> createLibraryCategory(@RequestBody LibraryCategory category) {
        log.info("Creating new library category: {}", category.getName());

        if (libraryCategoryRepository.findByName(category.getName()).isPresent()) {
            log.warn("Library category with name {} already exists", category.getName());
            return ResponseEntity.badRequest().build();
        }

        category.setActiveFlag(true);
        LibraryCategory savedCategory = libraryCategoryRepository.save(category);
        log.info("Successfully created library category with ID: {}", savedCategory.getId());
        return ResponseEntity.ok(savedCategory);
    }

    @PutMapping("/{id}")
    @Deprecated(since = "v1", forRemoval = true)
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
    @Deprecated(since = "v1", forRemoval = true)
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
