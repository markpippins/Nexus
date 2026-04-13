package nexus.serviceregistry.v1.controller;

import nexus.serviceregistry.v1.config.TestJpaConfig;
import nexus.serviceregistry.v1.entity.Library;
import nexus.serviceregistry.v1.repository.LibraryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LibraryController.class)
@Import(TestJpaConfig.class)
class LibraryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LibraryRepository libraryRepository;

    private Library testLibrary;

    @BeforeEach
    void setUp() {
        testLibrary = new Library();
        testLibrary.setId(1L);
        testLibrary.setName("Lodash");
        testLibrary.setPackageName("lodash");
        testLibrary.setActiveFlag(true);
    }

    @Test
    void getLibraries_ByName_Found() throws Exception {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.of(testLibrary));

        mockMvc.perform(get("/api/v1/libraries").param("name", "Lodash"))
                .andExpect(status().isOk());
    }

    @Test
    void getLibraries_ByName_NotFound() throws Exception {
        when(libraryRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/libraries").param("name", "Nonexistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getLibraries_ByCategoryId() throws Exception {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByCategory_Id(eq(1L), any())).thenReturn(libraryPage);

        mockMvc.perform(get("/api/v1/libraries").param("categoryId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getLibraries_ByLanguageId() throws Exception {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByLanguage_Id(eq(1L), any())).thenReturn(libraryPage);

        mockMvc.perform(get("/api/v1/libraries").param("languageId", "1"))
                .andExpect(status().isOk());
    }

    @Test
    void getLibraries_ByPackageManager() throws Exception {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findByPackageManager(eq("npm"), any())).thenReturn(libraryPage);

        mockMvc.perform(get("/api/v1/libraries").param("packageManager", "npm"))
                .andExpect(status().isOk());
    }

    @Test
    void getLibraries_All() throws Exception {
        Page<Library> libraryPage = new PageImpl<>(List.of(testLibrary));
        when(libraryRepository.findAll(any(Pageable.class))).thenReturn(libraryPage);

        mockMvc.perform(get("/api/v1/libraries"))
                .andExpect(status().isOk());
    }

    @Test
    void getLibraryById_Found() throws Exception {
        when(libraryRepository.findById(1L)).thenReturn(Optional.of(testLibrary));

        mockMvc.perform(get("/api/v1/libraries/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("Lodash"));
    }

    @Test
    void getLibraryById_NotFound() throws Exception {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/libraries/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void createLibrary_Success() throws Exception {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.empty());
        when(libraryRepository.save(any(Library.class))).thenReturn(testLibrary);

        mockMvc.perform(post("/api/v1/libraries")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Lodash\",\"packageName\":\"lodash\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createLibrary_DuplicateName() throws Exception {
        when(libraryRepository.findByName("Lodash")).thenReturn(Optional.of(testLibrary));

        mockMvc.perform(post("/api/v1/libraries")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Lodash\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateLibrary_Success() throws Exception {
        Library existingLibrary = new Library();
        existingLibrary.setId(1L);
        existingLibrary.setName("Old Library");

        when(libraryRepository.findById(1L)).thenReturn(Optional.of(existingLibrary));
        when(libraryRepository.findByName("New Library")).thenReturn(Optional.empty());
        when(libraryRepository.save(any(Library.class))).thenReturn(existingLibrary);

        mockMvc.perform(put("/api/v1/libraries/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Library\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateLibrary_NotFound() throws Exception {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/v1/libraries/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Library\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteLibrary_Success() throws Exception {
        when(libraryRepository.findById(1L)).thenReturn(Optional.of(testLibrary));
        doNothing().when(libraryRepository).deleteById(1L);

        mockMvc.perform(delete("/api/v1/libraries/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteLibrary_NotFound() throws Exception {
        when(libraryRepository.findById(1L)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/libraries/1"))
                .andExpect(status().isNotFound());
    }
}
