package com.angrysurfer.spring.nexus.repository;

import com.angrysurfer.spring.nexus.entity.Service;
import com.angrysurfer.spring.nexus.entity.ServiceConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ServiceConfigurationRepository extends JpaRepository<ServiceConfiguration, Long> {
    List<ServiceConfiguration> findByServiceId(Long serviceId);
    List<ServiceConfiguration> findByServiceIdAndEnvironmentId(Long serviceId, Long environmentId);
    Optional<ServiceConfiguration> findByServiceIdAndConfigKeyAndEnvironmentId(Long serviceId, String configKey, Long environmentId);
    List<ServiceConfiguration> findByConfigKey(String configKey);

    org.springframework.data.domain.Page<ServiceConfiguration> findByServiceId(Long serviceId, org.springframework.data.domain.Pageable pageable);
    org.springframework.data.domain.Page<ServiceConfiguration> findByServiceIdAndEnvironmentId(Long serviceId, Long environmentId, org.springframework.data.domain.Pageable pageable);

    // Method needed for backward compatibility with services
    Optional<ServiceConfiguration> findByServiceAndConfigKey(Service service, String configKey);
}
