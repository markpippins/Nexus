package com.aibizarchitect.nexus.v1.spring.serviceregistry.repository;

import com.aibizarchitect.nexus.v1.spring.serviceregistry.entity.SystemServices;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SystemServicesRepository extends JpaRepository<SystemServices, Long> {

    List<SystemServices> findBySystemId(Long systemId);

    List<SystemServices> findByServiceId(Long serviceId);

    @Query("SELECT ss FROM SystemServices ss WHERE ss.system.name = :systemName")
    List<SystemServices> findBySystemName(@Param("systemName") String systemName);

    @Query("SELECT ss FROM SystemServices ss WHERE ss.service.name = :serviceName")
    List<SystemServices> findByServiceName(@Param("serviceName") String serviceName);

    @Query("SELECT ss FROM SystemServices ss WHERE ss.system.name = :systemName AND ss.service.name = :serviceName")
    Optional<SystemServices> findBySystemNameAndServiceName(
            @Param("systemName") String systemName,
            @Param("serviceName") String serviceName);

    @Query("SELECT ss FROM SystemServices ss WHERE ss.activeFlag = true")
    List<SystemServices> findAllActive();

    boolean existsBySystemIdAndServiceId(Long systemId, Long serviceId);
}
