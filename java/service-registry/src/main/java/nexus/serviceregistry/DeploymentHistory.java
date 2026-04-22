package nexus.serviceregistry;

import java.time.LocalDateTime;

public class DeploymentHistory {
  private Long id;
  private Long deployment;
  private LocalDateTime timestamp;
  private String action;
  private String note;
  public DeploymentHistory() {}
  public DeploymentHistory(Long id, Long deployment, LocalDateTime timestamp, String action) {
    this.id = id; this.deployment = deployment; this.timestamp = timestamp; this.action = action;
  }
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Long getDeployment() { return deployment; }
  public void setDeployment(Long deployment) { this.deployment = deployment; }
  public LocalDateTime getTimestamp() { return timestamp; }
  public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
  public String getAction() { return action; }
  public void setAction(String action) { this.action = action; }
  public String getNote() { return note; }
  public void setNote(String note) { this.note = note; }
}
