package com.aibizarchitect.nexus.v1.spring.user;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByAlias(String alias);

    Optional<User> findByEmail(String email);

    List<User> findByAliasContainingIgnoreCase(String alias);
}
