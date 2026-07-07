package com.aibizarchitect.nexus.v1.spring.user.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;
import com.aibizarchitect.nexus.v1.spring.user.model.UserRegistration;
import com.aibizarchitect.nexus.v1.spring.user.repository.UserRegistrationRepository;

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

        UserRegistration userReg = userRepository.findByAlias(alias).orElse(null);

        if (userReg == null || !password.equals(userReg.getPassword())) {
            return null;
        }

        if (!password.equals(userReg.getPassword())) {
            log.info("Password mismatch for user {}", alias);
            return null;
        }

        return userReg.toDTO();
    }
}
