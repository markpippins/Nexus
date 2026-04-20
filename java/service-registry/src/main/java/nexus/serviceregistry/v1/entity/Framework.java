package nexus.serviceregistry.v1.entity;

public class Framework {
  private Long id;
  private String name;
  private Boolean activeFlag = true;

  public Framework() {}
  public Framework(Long id, String name, Boolean activeFlag) {
    this.id = id; this.name = name; this.activeFlag = activeFlag;
  }
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public Boolean getActiveFlag() { return activeFlag; }
  public void setActiveFlag(Boolean activeFlag) { this.activeFlag = activeFlag; }
}
