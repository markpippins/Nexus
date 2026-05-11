package com.aibizarchitect.nexus.v1.spring.user;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.user.UserDTO;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Service("userService")
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    /**
     * Record representing a test user with basic information. Used for
     * demonstration and testing purposes.
     */
    public record TestUser(String id, String email, String alias) {

        // Record body is intentionally empty as all functionality
        // is provided by the record's automatic implementation
    }

    /**
     * Record representing a user creation request. Contains validation
     * annotations for input validation.
     */
    public record CreateUserReq(
            @Email String email,
            @NotBlank String alias) {

        // Record body is intentionally empty as all functionality
        // is provided by the record's automatic implementation
    }

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
        log.info("UserService initialized");
    }

    // @BrokerOperation("login")
    // public UserDTO login(@BrokerParam("alias") String alias,
    // @BrokerParam("identifier") String password) {

    // log.info("Login user {}", alias);
    // User user = userRepository.findByAlias(alias).orElse(null);

    // if (user == null || !user.getIdentifier().equals(password)) {
    // return null;
    // }

    // return user.toDTO();
    // }

    @BrokerOperation("createUser")
    public UserDTO createUser(@BrokerParam("email") String email,
            @BrokerParam("alias") String alias,
            @BrokerParam("identifier") String password) {

        log.info("Create user {}", email);

        User user = new User(alias, email, null);
        user.setIdentifier(password);

        userRepository.save(user);
        return user.toDTO();
    }

    @BrokerOperation("delete")
    public void delete(@BrokerParam("userId") String userId) {
        log.info("Delete user id {}", userId);
        userRepository.deleteById(userId);
    }

    @BrokerOperation("findAll")
    public Set<UserDTO> findAll() {
        log.info("Find all users");
        HashSet<User> result = new HashSet<>();
        userRepository.findAll().forEach(result::add);
        return result.stream().map(user -> user.toDTO()).collect(Collectors.toSet());
    }

    @BrokerOperation("findById")
    public UserDTO findById(@BrokerParam("userId") String userId) throws ResourceNotFoundException {
        log.info("Find user by id {}", userId);
        Optional<User> result = userRepository.findById(userId);
        if (result.isPresent()) {
            return result.get().toDTO();
        }

        throw new ResourceNotFoundException("User ".concat(userId).concat(" not found."));
    }

    @BrokerOperation("findByAlias")
    public UserDTO findByAlias(@BrokerParam("alias") String alias) throws ResourceNotFoundException {
        log.info("Find user by alias {}", alias);
        UserDTO result;

        Optional<User> user = userRepository.findByAlias(alias);
        if (user.isPresent()) {
            // In MongoDB, the profile might be directly embedded or we might need to handle
            // it differently
            result = user.get().toDTO();

            return result;
        }

        throw new ResourceNotFoundException("User ".concat(alias).concat(" not found."));
    }

    @BrokerOperation("findByEmail")
    public UserDTO findByEmail(@BrokerParam("email") String email) throws ResourceNotFoundException {
        log.info("Find user by email {}", email);
        UserDTO result;

        Optional<User> user = userRepository.findByEmail(email);
        if (user.isPresent()) {
            result = user.get().toDTO();

            return result;
        }
        throw new ResourceNotFoundException("User ".concat(email).concat(" not found."));
    }

    @BrokerOperation("addUser")
    public UserDTO addUser(@BrokerParam("user") UserDTO newUser) {
        log.info("Adding user {}", newUser.getAlias());
        User user = new User(newUser.getAlias(), newUser.getEmail(), newUser.getAvatarUrl());
        // Note: identifier not set from DTO for security reasons
        return userRepository.save(user).toDTO();
    }

    public UserDTO save(@BrokerParam("alias") String alias, @BrokerParam("email") String email,
            @BrokerParam("password") String initialPassword) {
        log.info("Save user {}", alias);
        return userRepository.save(new User(alias, email, null)).toDTO();
    }

    @BrokerOperation("save")
    public UserDTO save(UserDTO newUser) {
        log.info("Save user {}", newUser.getAlias());
        User user = new User(newUser.getAlias(), newUser.getEmail(), newUser.getAvatarUrl());
        // Note: identifier not set from DTO for security reasons
        return userRepository.save(user).toDTO();
    }

    @BrokerOperation("update")
    public UserDTO update(@BrokerParam("user") User user) {
        log.info("Update user {}", user.getAlias());
        return userRepository.save(user).toDTO();
    }

    @BrokerOperation("getApplications")
    public List<Application> getApplications() {
        return List.of(new Application("App 1", "1"), new Application("App 2", "2"));
    }

    /**
     * Record representing an application with name and ID.
     */
    public record Application(String name, String id) {

        // Record body is intentionally empty as all functionality
        // is provided by the record's automatic implementation
    }

    @BrokerOperation("getUser")
    public UserDTO getUser(@BrokerParam("id") String id) throws ResourceNotFoundException {
        return findById(id);
    }

    @BrokerOperation("deleteUser")
    public void deleteUser(@BrokerParam("id") String id) {
        delete(id);
    }

    @BrokerOperation("saveUser")
    public UserDTO saveUser(@BrokerParam("user") UserDTO user) {
        return save(user);
    }

    @BrokerOperation("getUsers")
    public Set<UserDTO> getUsers() {
        return findAll();
    }

    @BrokerOperation("findAllPaginated")
    public Page<UserDTO> findAll(@BrokerParam("page") int page, @BrokerParam("size") int size) {
        log.info("Find all users paginated page {} size {}", page, size);
        return userRepository.findAll(PageRequest.of(page, size)).map(User::toDTO);
    }

    @BrokerOperation("search")
    public List<UserDTO> search(@BrokerParam("query") String query) {
        log.info("Search users query {}", query);
        return userRepository.findByAliasContainingIgnoreCase(query).stream()
                .map(User::toDTO)
                .collect(Collectors.toList());
    }

    // @BrokerOperation("getChoices")
    // public List<Choice> getChoices() {
    // return List.of(new Choice("Choice 1", "1"), new Choice("Choice 2", "2"));
    // }

    // /**
    // * Record representing a choice with label and value.
    // */
    // public record Choice(String label, String value) {

    // // Record body is intentionally empty as all functionality
    // // is provided by the record's automatic implementation
    // }
}
