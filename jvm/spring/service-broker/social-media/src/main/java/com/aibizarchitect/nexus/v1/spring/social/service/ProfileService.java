package com.aibizarchitect.nexus.v1.spring.social.service;

import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.social.model.Profile;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.ProfileRepository;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.social.ProfileDTO;

@Service
public class ProfileService {

    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);
    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
        log.info("ProfileService initialized");
    }

    @BrokerOperation("findByUserId")
    public ServiceResponse<ProfileDTO> findByUserId(@BrokerParam("userId") String userId) {
        log.info("Find profile by user id {}", userId);
        try {
            Optional<Profile> profile = profileRepository.findByUser_Id(UUID.fromString(userId));
            if (profile.isPresent()) {
                return ServiceResponse.ok(profile.get().toDTO(), "findByUserId-" + System.currentTimeMillis());
            }
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Profile not found for user " + userId)),
                    "findByUserId-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error finding profile by user id: {}", e.getMessage());
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to find profile: " + e.getMessage())),
                    "findByUserId-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("deleteByUserId")
    public ServiceResponse<String> deleteByUserId(@BrokerParam("userId") String userId) {
        log.info("Delete profile by user id {}", userId);
        try {
            profileRepository.deleteByUser_Id(UUID.fromString(userId));
            return ServiceResponse.ok("Profile deleted successfully", "deleteByUserId-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error deleting profile: {}", e.getMessage());
            return (ServiceResponse<String>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to delete profile: " + e.getMessage())),
                    "deleteByUserId-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("save")
    public ServiceResponse<ProfileDTO> save(@BrokerParam("user") User user, @BrokerParam("firstName") String firstName,
            @BrokerParam("lastName") String lastName) {
        log.info("Save profile for user {}", user.getAlias());
        try {
            Profile p = new Profile();
            p.setUser(user);
            p.setFirstName(firstName);
            p.setLastName(lastName);

            ProfileDTO result = profileRepository.save(p).toDTO();
            return ServiceResponse.ok(result, "save-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error saving profile: {}", e.getMessage());
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to save profile: " + e.getMessage())),
                    "save-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("findAllPaginated")
    public Page<ProfileDTO> findAll(@BrokerParam("page") int page, @BrokerParam("size") int size) {
        log.info("Find all profiles paginated page {} size {}", page, size);
        return profileRepository.findAll(PageRequest.of(page, size)).map(Profile::toDTO);
    }

    @BrokerOperation("updateProfile")
    public ServiceResponse<ProfileDTO> updateProfile(@BrokerParam("profileId") String profileId,
            @BrokerParam("profileData") ProfileDTO profileData) {
        log.info("Update profile id {}", profileId);
        try {
            Optional<Profile> profileOpt = profileRepository.findById(UUID.fromString(profileId));
            if (profileOpt.isPresent()) {
                Profile profile = profileOpt.get();
                if (profileData.getFirstName() != null)
                    profile.setFirstName(profileData.getFirstName());
                if (profileData.getLastName() != null)
                    profile.setLastName(profileData.getLastName());
                if (profileData.getCity() != null)
                    profile.setCity(profileData.getCity());
                if (profileData.getState() != null)
                    profile.setState(profileData.getState());
                if (profileData.getProfileImageUrl() != null)
                    profile.setProfileImageUrl(profileData.getProfileImageUrl());

                ProfileDTO result = profileRepository.save(profile).toDTO();
                return ServiceResponse.ok(result, "updateProfile-" + System.currentTimeMillis());
            }
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Profile " + profileId + " not found")),
                    "updateProfile-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error updating profile: {}", e.getMessage());
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to update profile: " + e.getMessage())),
                    "updateProfile-" + System.currentTimeMillis());
        }
    }

    @BrokerOperation("createProfile")
    public ServiceResponse<ProfileDTO> createProfile(@BrokerParam("profileData") ProfileDTO profileData) {
        log.info("Create profile from ProfileDTO");
        try {
            Profile p = new Profile();
            p.setFirstName(profileData.getFirstName());
            p.setLastName(profileData.getLastName());
            p.setCity(profileData.getCity());
            p.setState(profileData.getState());
            p.setProfileImageUrl(profileData.getProfileImageUrl());

            ProfileDTO result = profileRepository.save(p).toDTO();
            return ServiceResponse.ok(result, "createProfile-" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("Error creating profile: {}", e.getMessage());
            return (ServiceResponse<ProfileDTO>) ServiceResponse.error(
                    java.util.List.of(java.util.Map.of("message", "Failed to create profile: " + e.getMessage())),
                    "createProfile-" + System.currentTimeMillis());
        }
    }

}