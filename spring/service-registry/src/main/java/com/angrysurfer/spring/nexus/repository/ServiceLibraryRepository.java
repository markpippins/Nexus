package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.ServiceLibrary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ServiceLibraryRepository extends JpaRepository<ServiceLibrary, Long> {
    List<ServiceLibrary> findByServiceId(Long serviceId);

    List<ServiceLibrary> findByLibraryId(Long libraryId);

    Optional<ServiceLibrary> findByServiceIdAndLibraryId(Long serviceId, Long libraryId);

    List<ServiceLibrary> findByServiceIdAndIsDevDependency(Long serviceId, Boolean isDevDependency);

    List<ServiceLibrary> findByServiceIdAndIsDirect(Long serviceId, Boolean isDirect);

    org.springframework.data.domain.Page<ServiceLibrary> findByServiceId(Long serviceId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<ServiceLibrary> findByLibraryId(Long libraryId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<ServiceLibrary> findByServiceIdAndIsDevDependency(Long serviceId, Boolean isDevDependency, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<ServiceLibrary> findByServiceIdAndIsDirect(Long serviceId, Boolean isDirect, org.springframework.data.domain.Pageable pageable);
}
