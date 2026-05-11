package com.angrysurfer.helidon.nexus.user.config;

import com.angrysurfer.helidon.nexus.user.rest.UserResource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ApplicationPath;
import jakarta.ws.rs.core.Application;
import java.util.Set;
import java.util.HashSet;

@ApplicationScoped
@ApplicationPath("/api")
public class UserApplication extends Application {

    @Override
    public Set<Class<?>> getClasses() {
        Set<Class<?>> classes = new HashSet<>();
        classes.add(UserResource.class);
        return classes;
    }
}
