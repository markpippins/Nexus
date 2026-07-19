package com.aibizarchitect.nexus.v1.spring.atlas.repository;

import com.aibizarchitect.nexus.v1.spring.atlas.entity.GraphViewConnection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface GraphViewConnectionRepository extends JpaRepository<GraphViewConnection, Long> {

    /**
     * Delete all connections for a given graph view.
     * Uses a JPQL DELETE so the SQL executes immediately,
     * preventing Hibernate's INSERT-before-DELETE flush order
     * from violating the unique constraint.
     */
    @Modifying
    @Query("DELETE FROM GraphViewConnection c WHERE c.graphView.id = :graphViewId")
    void deleteByGraphViewId(@Param("graphViewId") Long graphViewId);
}
