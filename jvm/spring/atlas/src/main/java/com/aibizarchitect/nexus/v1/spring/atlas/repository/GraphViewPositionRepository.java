package com.aibizarchitect.nexus.v1.spring.atlas.repository;

import com.aibizarchitect.nexus.v1.spring.atlas.entity.GraphViewPosition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface GraphViewPositionRepository extends JpaRepository<GraphViewPosition, Long> {

    /**
     * Delete all positions for a given graph view.
     * Uses a JPQL DELETE so the SQL executes immediately,
     * preventing Hibernate's INSERT-before-DELETE flush order
     * from violating the unique (graph_view_id, node_id) constraint.
     */
    @Modifying
    @Query("DELETE FROM GraphViewPosition p WHERE p.graphView.id = :graphViewId")
    void deleteByGraphViewId(@Param("graphViewId") Long graphViewId);
}
