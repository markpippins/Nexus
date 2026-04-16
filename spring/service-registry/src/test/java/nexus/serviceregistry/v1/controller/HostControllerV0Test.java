// package nexus.serviceregistry.v1.controller;

// import nexus.serviceregistry.v1.client.ServicesConsoleClient;
// import nexus.serviceregistry.v1.entity.Host;
// import nexus.serviceregistry.v1.repository.HostRepository;
// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.extension.ExtendWith;
// import org.mockito.InjectMocks;
// import org.mockito.Mock;
// import org.mockito.junit.jupiter.MockitoExtension;
// import org.springframework.http.HttpStatus;
// import org.springframework.http.ResponseEntity;

// import java.util.List;
// import java.util.Optional;

// import static org.junit.jupiter.api.Assertions.*;
// import static org.mockito.ArgumentMatchers.*;
// import static org.mockito.Mockito.*;

// @ExtendWith(MockitoExtension.class)
// class HostControllerV0Test {

// @Mock
// private ServicesConsoleClient client;

// @Mock
// private HostRepository repository;

// @InjectMocks
// private HostControllerV0 controller;

// private Host testHost;

// @BeforeEach
// void setUp() {
// testHost = new Host();
// testHost.setId(1L);
// testHost.setHostname("test-server");
// }

// @Test
// void getAllServers() {
// when(repository.findAll()).thenReturn(List.of(testHost));

// List<Host> result = controller.getAllServers();

// assertEquals(1, result.size());
// verify(repository).findAll();
// }

// @Test
// void getServerById_Found() {
// when(repository.findById(1L)).thenReturn(Optional.of(testHost));

// ResponseEntity<Host> response = controller.getServerById(1L);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertEquals(testHost, response.getBody());
// }

// @Test
// void getServerById_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Host> response = controller.getServerById(1L);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// }

// @Test
// void getServerByHostname_Found() {
// when(repository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

// ResponseEntity<Host> response =
// controller.getServerByHostname("test-server");

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertEquals(testHost, response.getBody());
// }

// @Test
// void getServerByHostname_NotFound() {
// when(repository.findByHostname("nonexistent")).thenReturn(Optional.empty());

// ResponseEntity<Host> response =
// controller.getServerByHostname("nonexistent");

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// }

// @Test
// void createServer_Success() {
// when(repository.findByHostname("test-server")).thenReturn(Optional.empty());
// when(repository.save(any(Host.class))).thenReturn(testHost);

// ResponseEntity<Host> response = controller.createServer(testHost);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertNotNull(response.getBody());
// assertTrue(response.getBody().getActiveFlag());
// verify(repository).save(any(Host.class));
// }

// @Test
// void createServer_DuplicateHostname() {
// when(repository.findByHostname("test-server")).thenReturn(Optional.of(testHost));

// ResponseEntity<Host> response = controller.createServer(testHost);

// assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
// verify(repository, never()).save(any(Host.class));
// }

// @Test
// void updateServer_Success() {
// Host existingHost = new Host();
// existingHost.setId(1L);
// existingHost.setHostname("old-hostname");

// Host updatedHost = new Host();
// updatedHost.setHostname("new-hostname");

// when(repository.findById(1L)).thenReturn(Optional.of(existingHost));
// when(repository.findByHostname("new-hostname")).thenReturn(Optional.empty());
// when(repository.save(any(Host.class))).thenReturn(existingHost);

// ResponseEntity<Host> response = controller.updateServer(1L, updatedHost);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// verify(repository).save(any(Host.class));
// }

// @Test
// void updateServer_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Host> response = controller.updateServer(1L, testHost);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// verify(repository, never()).save(any(Host.class));
// }

// @Test
// void deleteServer_Success() {
// when(repository.findById(1L)).thenReturn(Optional.of(testHost));
// doNothing().when(repository).deleteById(1L);

// ResponseEntity<Void> response = controller.deleteServer(1L);

// assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
// verify(repository).deleteById(1L);
// }

// @Test
// void deleteServer_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Void> response = controller.deleteServer(1L);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// verify(repository, never()).deleteById(anyLong());
// }
// }
