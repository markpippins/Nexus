package com.angrysurfer.helidon.nexus.user.service;

import java.util.logging.Logger;

import com.angrysurfer.helidon.nexus.user.model.UserRegistration;
import com.angrysurfer.helidon.nexus.user.repository.UserRegistrationRepository;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class UserAccessService {

    private static final Logger log = Logger.getLogger(UserAccessService.class.getName());

    @Inject
    private UserRegistrationRepository userRepository;

    public UserAccessService() {
        log.info("UserAccessService initialized");
    }

    @BrokerOperation("validateUser")
    public UserRegistrationDTO validateUser(@BrokerParam("alias") String alias,
            @BrokerParam("identifier") String password) {

        log.info("Validating user " + alias);
        UserRegistration userReg = userRepository.findByAlias(alias).orElse(null);

        if (userReg == null) {
            return null;
        }

        return userReg.toDTO();
    }
}
