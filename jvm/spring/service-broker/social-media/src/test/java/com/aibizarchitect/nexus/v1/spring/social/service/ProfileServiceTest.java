package com.aibizarchitect.nexus.v1.spring.social.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.social.ProfileDTO;
import com.aibizarchitect.nexus.v1.spring.social.model.Profile;
import com.aibizarchitect.nexus.v1.spring.social.model.User;
import com.aibizarchitect.nexus.v1.spring.social.repository.ProfileRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("ProfileService")
class ProfileServiceTest {

    @Mock private ProfileRepository profileRepository;

    @InjectMocks private ProfileService profileService;

    private static final UUID PROFILE_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        user = new User("testuser", "test@example.com", "https://avatar.url");
        user.setId(USER_ID);

        profile = new Profile();
        profile.setId(PROFILE_ID);
        profile.setFirstName("John");
        profile.setLastName("Doe");
        profile.setUser(user);
    }

    // ── GREEN PATH ──────────────────────────────────────────────

    @Nested
    @DisplayName("GreenPath — valid inputs, successful operations")
    class GreenPath {

        @Test
        @DisplayName("save: creates profile for user")
        void save_createsProfile() {
            when(profileRepository.save(any(Profile.class))).thenReturn(profile);

            ServiceResponse<ProfileDTO> response = profileService.save(user, "John", "Doe");

            assertTrue(response.isOk());
            assertEquals("John", response.getData().getFirstName());
        }

        @Test
        @DisplayName("findByUserId: returns profile")
        void findByUserId_returnsProfile() {
            when(profileRepository.findByUser_Id(USER_ID)).thenReturn(Optional.of(profile));

            ServiceResponse<ProfileDTO> response = profileService.findByUserId(USER_ID.toString());

            assertTrue(response.isOk());
            assertEquals("John", response.getData().getFirstName());
        }

        @Test
        @DisplayName("findAllPaginated: returns paginated profiles")
        void findAllPaginated_returnsPage() {
            Page<Profile> page = new PageImpl<>(List.of(profile));
            when(profileRepository.findAll(any(PageRequest.class))).thenReturn(page);

            Page<ProfileDTO> result = profileService.findAll(0, 10);

            assertEquals(1, result.getTotalElements());
        }

        @Test
        @DisplayName("deleteByUserId: deletes profile")
        void deleteByUserId_deletesProfile() {
            doNothing().when(profileRepository).deleteByUser_Id(USER_ID);

            ServiceResponse<String> response = profileService.deleteByUserId(USER_ID.toString());

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("updateProfile: updates existing profile fields")
        void updateProfile_updatesFields() {
            ProfileDTO updateData = new ProfileDTO();
            updateData.setFirstName("Jane");
            updateData.setCity("Portland");

            when(profileRepository.findById(PROFILE_ID)).thenReturn(Optional.of(profile));
            when(profileRepository.save(any(Profile.class))).thenReturn(profile);

            ServiceResponse<ProfileDTO> response = profileService.updateProfile(PROFILE_ID.toString(), updateData);

            assertTrue(response.isOk());
            assertEquals("Jane", profile.getFirstName());
            assertEquals("Portland", profile.getCity());
            assertEquals("Doe", profile.getLastName()); // unchanged
        }

        @Test
        @DisplayName("updateProfile: null fields leave existing values unchanged")
        void updateProfile_nullFieldsIgnored() {
            ProfileDTO updateData = new ProfileDTO();
            updateData.setCity("Portland"); // only city set

            when(profileRepository.findById(PROFILE_ID)).thenReturn(Optional.of(profile));
            when(profileRepository.save(any(Profile.class))).thenReturn(profile);

            ServiceResponse<ProfileDTO> response = profileService.updateProfile(PROFILE_ID.toString(), updateData);

            assertTrue(response.isOk());
            assertEquals("John", profile.getFirstName()); // unchanged
            assertEquals("Doe", profile.getLastName());   // unchanged
        }

        @Test
        @DisplayName("createProfile: creates from DTO data")
        void createProfile_fromDTO() {
            ProfileDTO input = new ProfileDTO();
            input.setFirstName("Alice");
            input.setLastName("Smith");
            input.setCity("Boston");

            when(profileRepository.save(any(Profile.class))).thenAnswer(inv -> {
                Profile p = inv.getArgument(0);
                p.setId(UUID.randomUUID());
                return p;
            });

            ServiceResponse<ProfileDTO> response = profileService.createProfile(input);

            assertTrue(response.isOk());
            assertEquals("Alice", response.getData().getFirstName());
        }
    }

    // ── ORANGE PATH ─────────────────────────────────────────────

    @Nested
    @DisplayName("OrangePath — edge cases and boundary conditions")
    class OrangePath {

        @Test
        @DisplayName("save: saves profile successfully")
        void save_generatesId() {
            when(profileRepository.save(any(Profile.class))).thenAnswer(inv -> {
                Profile p = inv.getArgument(0);
                // Note: @PrePersist is a JPA callback, not invoked by Mockito
                // In production, Hibernate would call prePersist() to generate the UUID
                p.setId(UUID.randomUUID());
                return p;
            });

            ServiceResponse<ProfileDTO> response = profileService.save(user, "John", "Doe");

            assertTrue(response.isOk());
        }

        @Test
        @DisplayName("updateProfile: empty DTO changes nothing")
        void updateProfile_emptyDTO() {
            ProfileDTO empty = new ProfileDTO();
            when(profileRepository.findById(PROFILE_ID)).thenReturn(Optional.of(profile));
            when(profileRepository.save(any(Profile.class))).thenReturn(profile);

            ServiceResponse<ProfileDTO> response = profileService.updateProfile(PROFILE_ID.toString(), empty);

            assertTrue(response.isOk());
            assertEquals("John", profile.getFirstName());
            assertEquals("Doe", profile.getLastName());
        }
    }

    // ── RED PATH ────────────────────────────────────────────────

    @Nested
    @DisplayName("RedPath — error conditions and exceptions")
    class RedPath {

        @Test
        @DisplayName("findByUserId: profile not found")
        void findByUserId_notFound() {
            when(profileRepository.findByUser_Id(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<ProfileDTO> response = profileService.findByUserId(USER_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("findByUserId: invalid UUID")
        void findByUserId_invalidUuid() {
            ServiceResponse<ProfileDTO> response = profileService.findByUserId("not-a-uuid");

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("updateProfile: profile not found")
        void updateProfile_notFound() {
            when(profileRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

            ServiceResponse<ProfileDTO> response = profileService.updateProfile(PROFILE_ID.toString(), new ProfileDTO());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("deleteByUserId: repository exception")
        void deleteByUserId_repositoryException() {
            doThrow(new RuntimeException("DB error")).when(profileRepository).deleteByUser_Id(any(UUID.class));

            ServiceResponse<String> response = profileService.deleteByUserId(USER_ID.toString());

            assertFalse(response.isOk());
        }

        @Test
        @DisplayName("save: repository exception")
        void save_repositoryException() {
            when(profileRepository.save(any(Profile.class))).thenThrow(new RuntimeException("Constraint violation"));

            ServiceResponse<ProfileDTO> response = profileService.save(user, "John", "Doe");

            assertFalse(response.isOk());
        }
    }

    // ── SILENT-FAILURE PATH ─────────────────────────────────────

    @Nested
    @DisplayName("SilentFailure — operations that fail without clear signal")
    class SilentFailure {

        @Test
        @DisplayName("findAllPaginated: empty repository returns empty page")
        void findAllPaginated_emptyRepo() {
            Page<Profile> empty = new PageImpl<>(Collections.emptyList());
            when(profileRepository.findAll(any(PageRequest.class))).thenReturn(empty);

            Page<ProfileDTO> result = profileService.findAll(0, 10);

            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("createProfile: null fields in DTO produce null fields in profile")
        void createProfile_nullFields() {
            ProfileDTO input = new ProfileDTO();
            input.setFirstName("Minimal");

            when(profileRepository.save(any(Profile.class))).thenAnswer(inv -> {
                Profile p = inv.getArgument(0);
                p.setId(UUID.randomUUID());
                return p;
            });

            ServiceResponse<ProfileDTO> response = profileService.createProfile(input);

            assertTrue(response.isOk());
            assertEquals("Minimal", response.getData().getFirstName());
            assertNull(response.getData().getLastName()); // never set
        }
    }
}
