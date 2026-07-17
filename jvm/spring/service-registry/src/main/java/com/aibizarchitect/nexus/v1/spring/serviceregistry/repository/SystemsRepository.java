package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.Systems;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SystemsRepository extends JpaRepository<Systems, Long> {

    Optional<Systems> findByName(String name);

    boolean existsByName(String name);

    List<Systems> findBySystemTypeName(String systemTypeName);

    @Query("SELECT s FROM Systems s WHERE s.activeFlag = true")
    List<Systems> findAllActive();

    @Query("SELECT s FROM Systems s JOIN FETCH s.systemType st WHERE st.name = :typeName")
    List<Systems> findBySystemType(@Param("typeName") String typeName);
}
