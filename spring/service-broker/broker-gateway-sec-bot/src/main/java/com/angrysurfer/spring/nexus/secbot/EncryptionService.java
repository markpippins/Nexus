package com.angrysurfer.spring.nexus.secbot;

import org.jasypt.encryption.StringEncryptor;
import org.springframework.stereotype.Service;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class EncryptionService {

    private final StringEncryptor stringEncryptor;

    public EncryptionService(StringEncryptor stringEncryptor) {
        this.stringEncryptor = stringEncryptor;
    }

    public ServiceResponse encrypt(ServiceResponse serviceResponse) {
        if (serviceResponse.isEncrypt()) {
            Object data = serviceResponse.getData();
            if (data instanceof Map) {
                Map<String, Object> encryptedData = ((Map<String, Object>) data).entrySet().stream()
                        .collect(Collectors.toMap(Map.Entry::getKey, entry -> {
                            if (entry.getValue() instanceof String) {
                                return stringEncryptor.encrypt((String) entry.getValue());
                            }
                            return entry.getValue();
                        }, (a, b) -> b));
                serviceResponse.setData(encryptedData);
            }
        }
        return serviceResponse;
    }

    public ServiceRequest decrypt(ServiceRequest serviceRequest) {
        if (serviceRequest.isEncrypt()) {
            Map<String, Object> params = serviceRequest.getParams();
            if (params != null) {
                Map<String, Object> decryptedParams = new HashMap<>();
                for (Map.Entry<String, Object> entry : params.entrySet()) {
                    if (entry.getValue() instanceof String) {
                        decryptedParams.put(entry.getKey(), stringEncryptor.decrypt((String) entry.getValue()));
                    } else {
                        decryptedParams.put(entry.getKey(), entry.getValue());
                    }
                }
                serviceRequest.setParams(decryptedParams);
            }
        }
        return serviceRequest;
    }
}
