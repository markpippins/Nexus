package nexus.serviceregistry.v1.entity;

import java.time.LocalDateTime;

public class LifecycleEvent {
  private Long id;
  private String type;
  private LocalDateTime at;
  private String description;

  public LifecycleEvent() {}
  public LifecycleEvent(Long id, String type, LocalDateTime at) {
    this.id = id; this.type = type; this.at = at;
  }
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getType() { return type; }
  public void setType(String type) { this.type = type; }
  public LocalDateTime getAt() { return at; }
  public void setAt(LocalDateTime at) { this.at = at; }
  public String getDescription() { return description; }
  public void setDescription(String description) { this.description = description; }
}
