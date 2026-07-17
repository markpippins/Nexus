package com.aibizarchitect.nexus.v1.spring.atlas.repository;

import com.aibizarchitect.nexus.v1.spring.atlas.entity.GraphView;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GraphViewRepository extends JpaRepository<GraphView, Long> {

    Optional<GraphView> findByIsDefaultTrue();

    @EntityGraph(attributePaths = {"positions"})
    Optional<GraphView> findWithPositionsById(Long id);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE GraphView g SET g.isDefault = false WHERE g.isDefault = true")
    void clearDefault();
}
