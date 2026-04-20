package nexus.serviceregistry.v1.entity;

public class Library {
  private Long id;
  private String name;
  private String version;
  private Boolean activeFlag = true;

  public Library() {}
  public Library(Long id, String name, String version, Boolean activeFlag){
    this.id = id; this.name = name; this.version = version; this.activeFlag = activeFlag;
  }
  public Long getId(){ return id; }
  public void setId(Long id){ this.id = id; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public String getVersion(){ return version; }
  public void setVersion(String version){ this.version = version; }
  public Boolean getActiveFlag(){ return activeFlag; }
  public void setActiveFlag(Boolean activeFlag){ this.activeFlag = activeFlag; }
}
