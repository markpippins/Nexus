package nexus.serviceregistry.v1.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import nexus.serviceregistry.v1.entity.VisualComponent;

@Repository
public interface VisualComponentRepository extends JpaRepository<VisualComponent, Long> {
    Optional<VisualComponent> findByType(String type);
}
