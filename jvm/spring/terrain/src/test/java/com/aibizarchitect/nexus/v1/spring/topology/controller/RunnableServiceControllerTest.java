package com.aibizarchitect.nexus.v1.spring.topology.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.aibizarchitect.nexus.v1.spring.topology.entity.RunnableService;
import com.aibizarchitect.nexus.v1.spring.topology.repository.RunnableServiceRepository;

@ExtendWith(MockitoExtension.class)
class RunnableServiceControllerTest {

    @Mock
    private RunnableServiceRepository repository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new RunnableServiceController(repository)).build();
    }

    private RunnableService service(Long id, String name, String description) {
        RunnableService s = new RunnableService();
        s.setId(id);
        s.setName(name);
        s.setDescription(description);
        s.setPort(3300);
        s.setIsInternal(true);
        return s;
    }

    @Test
    void post_newName_createsWith201() throws Exception {
        when(repository.findByName("wind-srv")).thenReturn(Optional.empty());
        when(repository.save(any(RunnableService.class)))
                .thenAnswer(inv -> {
                    RunnableService s = inv.getArgument(0);
                    s.setId(99L);
                    return s;
                });

        mockMvc.perform(post("/api/v1/runnable-services")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"wind-srv\",\"port\":3300,\"isInternal\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(99))
                .andExpect(jsonPath("$.name").value("wind-srv"));

        verify(repository).save(any(RunnableService.class));
    }

    @Test
    void post_ExistingName_updatesInPlaceWith200() throws Exception {
        RunnableService existing = service(7L, "wind-srv", "old description");
        when(repository.findByName("wind-srv")).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        mockMvc.perform(post("/api/v1/runnable-services")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"wind-srv\",\"port\":3300,\"description\":\"new description\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.name").value("wind-srv"))
                .andExpect(jsonPath("$.description").value("new description"));

        // IDENTITY-backed id must be preserved on update (no re-insert)
        verify(repository).save(existing);
    }

    @Test
    void post_ExistingName_ignoresPayloadIdForEntityIdentity() throws Exception {
        // Even if the caller echoes an id (e.g. merged tool payload), the entity
        // identity is the name-keyed row, so the id is preserved from the found row.
        RunnableService existing = service(7L, "wind-srv", "desc");
        when(repository.findByName("wind-srv")).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        mockMvc.perform(post("/api/v1/runnable-services")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":999,\"name\":\"wind-srv\",\"port\":3300,\"description\":\"desc\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7));
    }
}