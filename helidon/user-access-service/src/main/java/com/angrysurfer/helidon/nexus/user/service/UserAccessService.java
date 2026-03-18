package com.angrysurfer.helidon.nexus.user.service;

import com.angrysurfer.helidon.nexus.user.UserDTO;
import com.angrysurfer.helidon.nexus.user.UserRegistrationDTO;
import com.angrysurfer.helidon.nexus.user.model.UserRegistration;
import com.angrysurfer.helidon.nexus.user.repository.UserRegistrationRepository;
import com.angrysurfer.spring.nexus.broker.spi.BrokerOperation;
import com.angrysurfer.spring.nexus.broker.spi.BrokerParam;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.logging.Logger;

@ApplicationScoped
public class UserAccessService {

    private static final Logger log = Logger.getLogger(UserAccessService.class.getName());

    @Inject
    private UserRegistrationRepository userRepository;

    public UserAccessService() {
        log.info("UserAccessService initialized");
    }

    @BrokerOperation("validateUser")
    public UserRegistrationDTO validateUser(@BrokerParam("alias") String alias, @BrokerParam("identifier") String password) {

        log.info("Validating user " + alias);
        UserRegistration userReg = userRepository.findByAlias(alias).orElse(null);

        if (userReg == null) {
            return null;
        }

        return userReg.toDTO();
    }
}
