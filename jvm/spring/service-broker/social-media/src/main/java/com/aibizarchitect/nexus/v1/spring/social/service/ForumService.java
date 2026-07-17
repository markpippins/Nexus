package com.aibizarchitect.nexus.v1.spring.social.service;

import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.social.model.Forum;
import com.aibizarchitect.nexus.v1.spring.social.repository.ForumRepository;
import com.aibizarchitect.nexus.v1.spring.social.repository.UserRepository;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.social.ForumDTO;
import com.aibizarchitect.nexus.v1.spring.social.UserDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.User;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import java.util.List;
import java.util.Set;

@Service
public class ForumService {

    private static final Logger log = LoggerFactory.getLogger(ForumService.class);
    private final ForumRepository forumRepository;
    private final UserRepository userRepository;

    public ForumService(ForumRepository forumRepository, UserRepository userRepository) {
        this.forumRepository = forumRepository;
        this.userRepository = userRepository;

        log.info("ForumService initialized");
    }

    @BrokerOperation("delete")
    public ServiceResponse<String> delete(@BrokerParam("forumId") String forumId) {
        log.info("Delete forum id {}", forumId);
        try {
            forumRepository.deleteById(UUID.fromString(forumId));
            return ServiceResponse.ok("Forum deleted successfully", "delete-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error deleting forum: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to delete forum: " + e.getMessage())),
                    "delete-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findById")
    public ServiceResponse<ForumDTO> findById(@BrokerParam("forumId") String forumId) {
        log.info("Find forum by id {}", forumId);
        try {
            Optional<Forum> forum = forumRepository.findById(UUID.fromString(forumId));
            if (forum.isPresent()) {
                return ServiceResponse.ok(forum.get().toDTO(), "findById-" + System.currentTimeMillis());
            }
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Forum " + forumId + " not found")),
                    "findById-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding forum by id: {}", e.getMessage());
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find forum: " + e.getMessage())),
                    "findById-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findAll")
    public ServiceResponse<Iterable<ForumDTO>> findAll() {
        log.info("Find all forums");
        try {
            Iterable<ForumDTO> forums = forumRepository.findAll().stream()
                    .map(forum -> forum.toDTO())
                    .collect(Collectors.toSet());
            return ServiceResponse.ok(forums, "findAll-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding all forums: {}", e.getMessage());
            return (ServiceResponse<Iterable<ForumDTO>>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find forums: " + e.getMessage())),
                    "findAll-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("save")
    public ServiceResponse<ForumDTO> save(@BrokerParam("name") String name) {
        log.info("Save forum {}", name);
        try {
            ForumDTO result = forumRepository.save(new Forum(name)).toDTO();
            return ServiceResponse.ok(result, "save-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error saving forum: {}", e.getMessage());
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to save forum: " + e.getMessage())),
                    "save-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("saveForum")
    public ServiceResponse<ForumDTO> save(@BrokerParam("forum") Forum forum) {
        log.info("Save forum {}", forum.getName());
        try {
            ForumDTO result = forumRepository.save(forum).toDTO();
            return ServiceResponse.ok(result, "saveForum-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error saving forum entity: {}", e.getMessage());
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to save forum entity: " + e.getMessage())),
                    "saveForum-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findByName")
    public ServiceResponse<ForumDTO> findByName(@BrokerParam("name") String name) {
        log.info("Find forum by name {}", name);
        try {
            Optional<Forum> forum = forumRepository.findByName(name);
            if (forum.isPresent()) {
                return ServiceResponse.ok(forum.get().toDTO(), "findByName-" + System.currentTimeMillis());
            }
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Forum " + name + " not found")),
                    "findByName-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding forum by name: {}", e.getMessage());
            return (ServiceResponse<ForumDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find forum by name: " + e.getMessage())),
                    "findByName-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("addMember")
    public ServiceResponse<String> addMember(@BrokerParam("forumId") String forumId,
            @BrokerParam("userId") String userId) {
        log.info("Add member {} to forum {}", userId, forumId);
        try {
            Optional<Forum> forumOpt = forumRepository.findById(UUID.fromString(forumId));
            Optional<User> userOpt = userRepository.findById(UUID.fromString(userId));

            if (forumOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Forum " + forumId + " not found")),
                        "addMember-" + System.currentTimeMillis());
            }
            if (userOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User " + userId + " not found")),
                        "addMember-" + System.currentTimeMillis());
            }

            Forum forum = forumOpt.get();
            forum.addMember(userOpt.get());
            forumRepository.save(forum);

            return ServiceResponse.ok("Member added successfully", "addMember-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error adding member: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to add member: " + e.getMessage())),
                    "addMember-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("removeMember")
    public ServiceResponse<String> removeMember(@BrokerParam("forumId") String forumId,
            @BrokerParam("userId") String userId) {
        log.info("Remove member {} from forum {}", userId, forumId);
        try {
            Optional<Forum> forumOpt = forumRepository.findById(UUID.fromString(forumId));
            Optional<User> userOpt = userRepository.findById(UUID.fromString(userId));

            if (forumOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "Forum " + forumId + " not found")),
                        "removeMember-" + System.currentTimeMillis());
            }
            if (userOpt.isEmpty()) {
                return (ServiceResponse<String>) ServiceResponse.error(
                        java.util.List.of(java.util.Map.of("message", "User " + userId + " not found")),
                        "removeMember-" + System.currentTimeMillis());
            }

            Forum forum = forumOpt.get();
            forum.getMembers().remove(userOpt.get());
            forumRepository.save(forum);

            return ServiceResponse.ok("Member removed successfully", "removeMember-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error removing member: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to remove member: " + e.getMessage())),
                    "removeMember-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("getMembers")
    public Page<UserDTO> getMembers(@BrokerParam("forumId") String forumId, @BrokerParam("page") int page,
            @BrokerParam("size") int size) {
        log.info("Get members for forum {} page {} size {}", forumId, page, size);
        Optional<Forum> forumOpt = forumRepository.findById(UUID.fromString(forumId));
        if (forumOpt.isPresent()) {
            Set<User> members = forumOpt.get().getMembers();
            List<UserDTO> memberList = members.stream()
                    .skip((long) page * size)
                    .limit(size)
                    .map(User::toDTO)
                    .collect(Collectors.toList());
            return new PageImpl<>(memberList, PageRequest.of(page, size), members.size());
        }
        return Page.empty();
    }
}
