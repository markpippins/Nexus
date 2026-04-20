package nexus.serviceregistry.v1.entity;

public class ServiceLibrary {
  private Long id;
  private String name;
  private String version;
  public ServiceLibrary() {}
  public ServiceLibrary(Long id, String name, String version){ this.id = id; this.name = name; this.version = version; }
  public Long getId(){ return id; }
  public void setId(Long id){ this.id = id; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
  public String getVersion(){ return version; }
  public void setVersion(String version){ this.version = version; }
}
