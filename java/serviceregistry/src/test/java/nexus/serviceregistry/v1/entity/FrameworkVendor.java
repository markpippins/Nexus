package nexus.serviceregistry.v1.entity;

public class FrameworkVendor {
  private Long id;
  private String name;
  private String description;
  private String url;
  private Boolean activeFlag;
  public FrameworkVendor() {}
  public FrameworkVendor(Long id, String name, String description, String url, Boolean activeFlag){
    this.id = id; this.name = name; this.description = description; this.url = url; this.activeFlag = activeFlag;
  }
  public Long getId(){ return id; }
  public void setId(Long id){ this.id = id; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public String getDescription(){ return description; }
  public void setDescription(String description){ this.description = description; }
  public String getUrl(){ return url; }
  public void setUrl(String url){ this.url = url; }
  public Boolean getActiveFlag(){ return activeFlag; }
  public void setActiveFlag(Boolean activeFlag){ this.activeFlag = activeFlag; }
}
