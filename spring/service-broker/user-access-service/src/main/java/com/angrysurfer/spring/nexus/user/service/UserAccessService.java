package com.angrysurfer.spring.nexus.user.service;

import com.angrysurfer.nexus.user.UserDTO;
import com.angrysurfer.nexus.user.UserRegistrationDTO;
import com.angrysurfer.spring.nexus.broker.spi.BrokerOperation;
import com.angrysurfer.spring.nexus.broker.spi.BrokerParam;
import com.angrysurfer.spring.nexus.user.model.UserRegistration;
import com.angrysurfer.spring.nexus.user.repository.UserRegistrationRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service("userAccessService")
public class UserAccessService {

    private static final Logger log = LoggerFactory.getLogger(UserAccessService.class);

    private final UserRegistrationRepository userRepository;

    public UserAccessService(UserRegistrationRepository userRepository) {
        this.userRepository = userRepository;
        log.info("UserAccessService initialized");
    }

    @BrokerOperation("validateUser")
    public UserRegistrationDTO validateUser(@BrokerParam("alias") String alias,
            @BrokerParam("identifier") String password) {

        log.info("Validating user {}", alias);

        // Hardcoded admin check for verification
        if ("admin".equalsIgnoreCase(alias) && "admin".equals(password)) {
            UserRegistrationDTO user = new UserRegistrationDTO();
            user.setId("1");
            user.setAlias("admin");
            user.setEmail("admin@example.com");
            user.setAdmin(true);
            return user;
        }

        UserRegistration userReg = userRepository.findByAlias(alias).orElse(null);

        if (userReg == null) {
            return null;
        }

        return userReg.toDTO();
    }
}