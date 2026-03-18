package com.angrysurfer.spring.nexus.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.angrysurfer.spring.nexus.entity.Framework;
import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.entity.ServiceType;

@Repository
public interface ServiceRepository extends JpaRepository<Service, Long> {
    Optional<Service> findByName(String name);

    List<Service> findByFramework(Framework framework);

    List<Service> findByFramework_Id(Long frameworkId);

    List<Service> findByType(ServiceType type);

    List<Service> findByType_Id(Long serviceTypeId);

    List<Service> findByStatus(String status);

    @Query("SELECT s FROM Service s JOIN s.serviceDependenciesAsConsumer d WHERE d.id = :serviceId")
    List<Service> findDependents(Long serviceId);

    List<Service> findByParentService(Service parentService);

    List<Service> findByParentService_Id(Long parentServiceId);

    List<Service> findByParentServiceIsNull();

    org.springframework.data.domain.Page<Service> findByFramework(Framework framework, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByFramework_Id(Long frameworkId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByType(ServiceType type, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByType_Id(Long serviceTypeId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByStatus(String status, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByParentService(Service parentService, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByParentService_Id(Long parentServiceId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<Service> findByParentServiceIsNull(org.springframework.data.domain.Pageable pageable);
}
