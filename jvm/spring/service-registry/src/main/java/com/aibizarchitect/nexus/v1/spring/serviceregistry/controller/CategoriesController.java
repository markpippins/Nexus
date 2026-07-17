package com.aibizarchitect.nexus.v1.spring.serviceregistry.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aibizarchitect.nexus.v1.dto.PagedResponse;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.dto.SpringPagedResponse;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.CategoriesView;
import com.aibizarchitect.nexus.v1.spring.serviceregistry.repository.CategoriesViewRepository;

/**
 * REST controller for the unified {@code registry.categories} view.
 *
 * Returns a paginated, optionally type-filtered union of all 7 type
 * lookup tables.  This is a **read-only** endpoint — individual type
 * mutations go through their own controllers
 * (e.g. {@link FrameworkTypeController}, {@link ServerTypeController}).
 */
@RestController
@RequestMapping("/api/v1/categories")
@CrossOrigin(origins = "*")
@SuppressWarnings("null")
public class CategoriesController {

    private static final Logger log = LoggerFactory.getLogger(CategoriesController.class);

    private final CategoriesViewRepository repository;

    public CategoriesController(CategoriesViewRepository repository) {
        this.repository = repository;
    }

    /**
     * List all categories, optionally filtered by {@code type} and/or
     * {@code name}.
     *
     * @param type     optional discriminator filter (e.g. {@code "framework_type"},
     *                 {@code "server_type"})
     * @param name     optional name substring filter (case-insensitive)
     * @param pageable Spring pagination parameters
     * @return paginated list of categories
     */
    @GetMapping
    public ResponseEntity<PagedResponse<CategoriesView>> getAll(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String name,
            @PageableDefault(size = 500) Pageable pageable) {

        log.info("Fetching categories [type={}, name={}, page={}, size={}]",
                type, name, pageable.getPageNumber(), pageable.getPageSize());

        Page<CategoriesView> page;
        if (type != null && !type.isBlank() && name != null && !name.isBlank()) {
            page = repository.findByNameContainingIgnoreCaseAndType(name, type, pageable);
        } else if (type != null && !type.isBlank()) {
            page = repository.findByType(type, pageable);
        } else {
            page = repository.findAll(pageable);
        }

        log.debug("Fetched {} categories (total: {})", page.getNumberOfElements(), page.getTotalElements());
        return ResponseEntity.ok(SpringPagedResponse.fromPage(page));
    }
}
