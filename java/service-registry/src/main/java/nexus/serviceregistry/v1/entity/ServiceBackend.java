package nexus.serviceregistry.v1.entity;

public class ServiceBackend {
  private Long id;
  private String name;
  private Boolean activeFlag = true;
  public ServiceBackend() {}
  public ServiceBackend(Long id, String name){ this.id = id; this.name = name; }
  public Long getId(){ return id; }
  public void setId(Long id){ this.id = id; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public Boolean getActiveFlag(){ return activeFlag; }
  public void setActiveFlag(Boolean activeFlag){ this.activeFlag = activeFlag; }
}
