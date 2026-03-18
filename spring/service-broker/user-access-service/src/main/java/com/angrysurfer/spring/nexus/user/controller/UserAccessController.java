package com.angrysurfer.spring.nexus.user.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.user.service.UserAccessService;

@RestController
@RequestMapping("/user")
public class UserAccessController {

    private final UserAccessService userAccessService;

    public UserAccessController(UserAccessService userAccessService) {
        this.userAccessService = userAccessService;
    }

    @PostMapping(value = "/validate", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<UserRegistrationDTO> validateUser(@RequestParam("alias") String alias,
            @RequestParam("identifier") String password) {
        UserRegistrationDTO user = userAccessService.validateUser(alias, password);
        if (user != null) {
            return ResponseEntity.ok(user);
        } else {
            return ResponseEntity.status(401).build();
        }
    }
}
