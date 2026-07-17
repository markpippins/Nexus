package com.aibizarchitect.nexus.v1.spring.social;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.aibizarchitect.nexus.v1.spring.social.ProfileDTO;

import java.util.HashSet;
import java.util.Set;

class ProfileDTOTest {

    private ProfileDTO profileDTO;

    @BeforeEach
    void setUp() {
        profileDTO = new ProfileDTO();
    }

    @Test
    void testId() {
        String expectedId = "profile123";
        profileDTO.setId(expectedId);
        
        assertEquals(expectedId, profileDTO.getId());
    }

    @Test
    void testFirstName() {
        String expectedFirstName = "John";
        profileDTO.setFirstName(expectedFirstName);
        
        assertEquals(expectedFirstName, profileDTO.getFirstName());
    }

    @Test
    void testLastName() {
        String expectedLastName = "Doe";
        profileDTO.setLastName(expectedLastName);
        
        assertEquals(expectedLastName, profileDTO.getLastName());
    }

    @Test
    void testCity() {
        String expectedCity = "New York";
        profileDTO.setCity(expectedCity);
        
        assertEquals(expectedCity, profileDTO.getCity());
    }

    @Test
    void testState() {
        String expectedState = "NY";
        profileDTO.setState(expectedState);
        
        assertEquals(expectedState, profileDTO.getState());
    }

    @Test
    void testProfileImageUrl() {
        String expectedProfileImageUrl = "https://example.com/profile.jpg";
        profileDTO.setProfileImageUrl(expectedProfileImageUrl);
        
        assertEquals(expectedProfileImageUrl, profileDTO.getProfileImageUrl());
    }

    @Test
    void testInterests() {
        Set<String> interests = new HashSet<>();
        interests.add("Technology");
        profileDTO.setInterests(interests);
        
        assertEquals(interests, profileDTO.getInterests());
        assertTrue(profileDTO.getInterests().contains("Technology"));
    }

    @Test
    void testDefaultValues() {
        ProfileDTO dto = new ProfileDTO();
        
        // Test default empty collections
        assertNotNull(dto.getInterests());
        assertTrue(dto.getInterests().isEmpty());
    }
}