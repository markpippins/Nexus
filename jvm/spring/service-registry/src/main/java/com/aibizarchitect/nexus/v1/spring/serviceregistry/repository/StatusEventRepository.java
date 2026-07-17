package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.StatusEvent;

public interface StatusEventRepository extends JpaRepository<StatusEvent, Long> {

    List<StatusEvent> findByServiceNameOrderByChangedAtDesc(String serviceName);

    List<StatusEvent> findByServiceNameAndChangedAtAfterOrderByChangedAtDesc(
            String serviceName, LocalDateTime since);

    @Query("SELECT e FROM StatusEvent e WHERE e.serviceName = :serviceName " +
           "ORDER BY e.changedAt DESC LIMIT :limit")
    List<StatusEvent> findRecentByServiceName(
            @Param("serviceName") String serviceName,
            @Param("limit") int limit);

    @Query("SELECT e FROM StatusEvent e ORDER BY e.changedAt DESC LIMIT :limit")
    List<StatusEvent> findRecentGlobal(@Param("limit") int limit);
}
