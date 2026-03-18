package com.angrysurfer.spring.nexus.secbot;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

@RestController
@RequestMapping("/secbot")
public class EncryptionController {

    private final EncryptionService encryptionService;

    public EncryptionController(EncryptionService encryptionService) {
        this.encryptionService = encryptionService;
    }

    @PostMapping("/encrypt")
    public ServiceResponse encrypt(@RequestBody ServiceResponse serviceResponse) {
        return encryptionService.encrypt(serviceResponse);
    }

    @PostMapping("/decrypt")
    public ServiceRequest decrypt(@RequestBody ServiceRequest serviceRequest) {
        return encryptionService.decrypt(serviceRequest);
    }
}
