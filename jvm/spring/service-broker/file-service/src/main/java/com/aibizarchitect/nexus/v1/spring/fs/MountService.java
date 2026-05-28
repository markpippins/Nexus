package com.aibizarchitect.nexus.v1.spring.fs;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.broker.Broker;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.fs.api.Mount;
import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;

@Service("mountService")
public class MountService {

    private static final Logger log = LoggerFactory.getLogger(MountService.class);

    private final Broker broker;

    public MountService(Broker broker) {
        this.broker = broker;
        log.info("MountService initialized");
    }

    @BrokerOperation("listMounts")
    public List<Mount> listMounts(@BrokerParam("token") String token) {
        if (token == null) {
            throw new RuntimeException("Token is required to list mounts");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }

        Mount defaultMount = new Mount();
        defaultMount.setId("default");
        defaultMount.setName("My Files");
        defaultMount.setType("user-home");
        defaultMount.setDefaultMount(true);
        defaultMount.setRootPath(List.of("users", alias, "default"));

        return List.of(defaultMount);
    }

    private String getUserAliasFromToken(String token) {
        try {
            ServiceRequest request = new ServiceRequest(
                "loginService",
                "getUserRegistrationForToken",
                Map.of("token", token),
                "get-user-alias-" + System.currentTimeMillis()
            );

            ServiceResponse<?> response = (ServiceResponse<?>) broker.submit(request);

            if (response.isOk() && response.getData() != null) {
                Object data = response.getData();
                if (data instanceof UserRegistrationDTO) {
                    return ((UserRegistrationDTO) data).getAlias();
                } else if (data instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> dataMap = (Map<String, Object>) data;
                    return (String) dataMap.get("alias");
                } else {
                    log.warn("Unexpected data type returned from user registration service: {}", data.getClass());
                    return null;
                }
            } else {
                log.warn("Failed to get user registration for token: {}", token);
                return null;
            }
        } catch (Exception e) {
            log.error("Error getting user alias from token: ", e);
            return null;
        }
    }
}
