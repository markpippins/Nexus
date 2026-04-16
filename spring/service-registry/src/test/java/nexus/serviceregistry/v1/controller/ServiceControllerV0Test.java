// package nexus.serviceregistry.v1.controller;

// import nexus.serviceregistry.v1.client.ServicesConsoleClient;
// import nexus.serviceregistry.v1.entity.Service;
// import nexus.serviceregistry.v1.repository.ServiceRepository;
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
// class ServiceControllerV0Test {

// @Mock
// private ServicesConsoleClient client;

// @Mock
// private ServiceRepository repository;

// @InjectMocks
// private ServiceControllerV0 controller;

// private Service testService;

// @BeforeEach
// void setUp() {
// testService = new Service();
// testService.setId(1L);
// testService.setName("Test Service");
// }

// @Test
// void getAllServices() {
// when(repository.findAll()).thenReturn(List.of(testService));

// List<Service> result = controller.getAllServices();

// assertEquals(1, result.size());
// verify(repository).findAll();
// }

// @Test
// void getAllServicesIncludingInactive() {
// when(repository.findAll()).thenReturn(List.of(testService));

// List<Service> result = controller.getAllServicesIncludingInactive();

// assertEquals(1, result.size());
// verify(repository).findAll();
// }

// @Test
// void getServiceById_Found() {
// when(repository.findById(1L)).thenReturn(Optional.of(testService));

// ResponseEntity<Service> response = controller.getServiceById(1L);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertEquals(testService, response.getBody());
// }

// @Test
// void getServiceById_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Service> response = controller.getServiceById(1L);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// }

// @Test
// void getServiceByName_Found() {
// when(repository.findByName("Test
// Service")).thenReturn(Optional.of(testService));

// ResponseEntity<Service> response = controller.getServiceByName("Test
// Service");

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertEquals(testService, response.getBody());
// }

// @Test
// void getServiceByName_NotFound() {
// when(repository.findByName("Nonexistent")).thenReturn(Optional.empty());

// ResponseEntity<Service> response =
// controller.getServiceByName("Nonexistent");

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// }

// @Test
// void getServicesByFramework() {
// when(repository.findByFramework_Id(1L)).thenReturn(List.of(testService));

// List<Service> result = controller.getServicesByFramework(1L);

// assertEquals(1, result.size());
// verify(repository).findByFramework_Id(1L);
// }

// @Test
// void getServiceDependencies() {
// ResponseEntity<List<Service>> response =
// controller.getServiceDependencies(1L);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertTrue(response.getBody().isEmpty());
// }

// @Test
// void getServiceDependents() {
// ResponseEntity<List<Service>> response =
// controller.getServiceDependents("1");

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertTrue(response.getBody().isEmpty());
// }

// @Test
// void getSubModules() {
// when(repository.findByParentService_Id(1L)).thenReturn(List.of(testService));

// ResponseEntity<List<Service>> response = controller.getSubModules(1L);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertEquals(1, response.getBody().size());
// }

// @Test
// void getStandaloneServices() {
// when(repository.findByParentServiceIsNull()).thenReturn(List.of(testService));

// List<Service> result = controller.getStandaloneServices();

// assertEquals(1, result.size());
// verify(repository).findByParentServiceIsNull();
// }

// @Test
// void createService_Success() {
// when(repository.findByName("Test Service")).thenReturn(Optional.empty());
// when(repository.save(any(Service.class))).thenReturn(testService);

// ResponseEntity<Service> response = controller.createService(testService);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// assertNotNull(response.getBody());
// assertTrue(response.getBody().getActiveFlag());
// verify(repository).save(any(Service.class));
// }

// @Test
// void createService_DuplicateName() {
// when(repository.findByName("Test
// Service")).thenReturn(Optional.of(testService));

// ResponseEntity<Service> response = controller.createService(testService);

// assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
// verify(repository, never()).save(any(Service.class));
// }

// @Test
// void updateService_Success() {
// Service existingService = new Service();
// existingService.setId(1L);
// existingService.setName("Old Name");

// Service updatedService = new Service();
// updatedService.setName("New Name");

// when(repository.findById(1L)).thenReturn(Optional.of(existingService));
// when(repository.findByName("New Name")).thenReturn(Optional.empty());
// when(repository.save(any(Service.class))).thenReturn(existingService);

// ResponseEntity<Service> response = controller.updateService(1L,
// updatedService);

// assertEquals(HttpStatus.OK, response.getStatusCode());
// verify(repository).save(any(Service.class));
// }

// @Test
// void updateService_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Service> response = controller.updateService(1L, testService);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// verify(repository, never()).save(any(Service.class));
// }

// @Test
// void deleteService_Success() {
// when(repository.findById(1L)).thenReturn(Optional.of(testService));
// doNothing().when(repository).deleteById(1L);

// ResponseEntity<Void> response = controller.deleteService(1L);

// assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
// verify(repository).deleteById(1L);
// }

// @Test
// void deleteService_NotFound() {
// when(repository.findById(1L)).thenReturn(Optional.empty());

// ResponseEntity<Void> response = controller.deleteService(1L);

// assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
// verify(repository, never()).deleteById(anyLong());
// }
// }
