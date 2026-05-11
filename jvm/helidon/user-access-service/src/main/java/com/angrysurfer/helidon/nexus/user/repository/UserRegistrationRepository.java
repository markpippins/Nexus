package com.angrysurfer.helidon.nexus.user.repository;

import java.util.Optional;

import com.angrysurfer.helidon.nexus.user.model.UserRegistration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class UserRegistrationRepository {

    @PersistenceContext
    private EntityManager em;

    public Optional<UserRegistration> findByAlias(String alias) {
        TypedQuery<UserRegistration> query = em.createQuery(
                "SELECT u FROM UserRegistration u WHERE u.alias = :alias", UserRegistration.class);
        query.setParameter("alias", alias);
        return query.getResultStream().findFirst();
    }

    public Optional<UserRegistration> findByEmail(String email) {
        TypedQuery<UserRegistration> query = em.createQuery(
                "SELECT u FROM UserRegistration u WHERE u.email = :email", UserRegistration.class);
        query.setParameter("email", email);
        return query.getResultStream().findFirst();
    }

    @Transactional
    public UserRegistration save(UserRegistration userRegistration) {
        if (userRegistration.getId() == null) {
            em.persist(userRegistration);
            return userRegistration;
        } else {
            return em.merge(userRegistration);
        }
    }
}
