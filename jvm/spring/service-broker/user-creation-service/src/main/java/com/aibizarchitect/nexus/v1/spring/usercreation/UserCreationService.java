package com.aibizarchitect.nexus.v1.spring.usercreation;

import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;

import org.springframework.stereotype.Service;

/**
 * Handles user creation logic.
 * Reuses the UserRegistration entity and JpaRepository from user-access-service.
 */
@Service
public class UserCreationService {

    private final UserRegistrationRepository repository;

    public UserCreationService(UserRegistrationRepository repository) {
        this.repository = repository;
    }

    /**
     * Create a new user.
     *
     * @param alias      unique username (required)
     * @param email      user email
     * @param identifier password / security identifier (persisted to the identifier column)
     * @param admin      whether the user has admin privileges
     * @return the persisted UserRegistration (with generated id)
     * @throws IllegalArgumentException if alias already exists
     */
    public UserRegistration createUser(String alias, String email, String identifier, boolean admin) {
        if (repository.findByAlias(alias).isPresent()) {
            throw new IllegalArgumentException("Alias already exists: " + alias);
        }

        UserRegistration user = new UserRegistration();
        user.setAlias(alias);
        user.setEmail(email);
        user.setAdmin(admin);
        user.setIdentifier(identifier);

        return repository.save(user);
    }
}
