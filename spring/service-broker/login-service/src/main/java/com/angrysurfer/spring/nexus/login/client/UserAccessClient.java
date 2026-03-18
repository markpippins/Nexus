package com.angrysurfer.spring.nexus.login.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;

@FeignClient(name = "user-access-service", url = "${user-access-service.url:http://localhost:8083}")
public interface UserAccessClient {

    @PostMapping(value = "/user/validate", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    UserRegistrationDTO validateUser(@RequestBody MultiValueMap<String, String> params);
}
