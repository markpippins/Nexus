package nexus.serviceregistry.v1.entity;

public class VisualComponent {
  private Long id;
  private String name;
  public VisualComponent() {}
  public VisualComponent(Long id, String name){ this.id = id; this.name = name; }
  public Long getId(){ return id; }
  public void setId(Long id){ this.id = id; }
  public String getName(){ return name; }
  public void setName(String name){ this.name = name; }
}
