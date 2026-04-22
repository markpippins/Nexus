package nexus.serviceregistry.v1.entity;

import java.time.LocalDateTime;

public class HealthCheck {
  private Long id;
  private boolean ok;
  private LocalDateTime timestamp;
  private String details;

  public HealthCheck() {}
  public HealthCheck(Long id, boolean ok, LocalDateTime timestamp) {
    this.id = id; this.ok = ok; this.timestamp = timestamp;
  }
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public boolean isOk() { return ok; }
  public void setOk(boolean ok) { this.ok = ok; }
  public LocalDateTime getTimestamp() { return timestamp; }
  public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
  public String getDetails() { return details; }
  public void setDetails(String details) { this.details = details; }
}
