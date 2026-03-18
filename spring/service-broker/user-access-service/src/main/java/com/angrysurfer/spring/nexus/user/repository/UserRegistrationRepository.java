package com.angrysurfer.spring.nexus.user.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.angrysurfer.spring.nexus.user.model.UserRegistration;
import java.util.Optional;

@Repository
public interface UserRegistrationRepository extends JpaRepository<UserRegistration, Long> {
    Optional<UserRegistration> findByAlias(String alias);
    Optional<UserRegistration> findByEmail(String email);
}
