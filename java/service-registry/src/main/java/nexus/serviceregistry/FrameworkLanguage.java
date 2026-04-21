package nexus.serviceregistry;

public class FrameworkLanguage {
  private Long id;
  private String name;
  private String currentVersion;
  private String ltsVersion;

  public FrameworkLanguage() {}
  public FrameworkLanguage(Long id, String name, String currentVersion, String ltsVersion) {
    this.id = id; this.name = name; this.currentVersion = currentVersion; this.ltsVersion = ltsVersion;
  }
  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getCurrentVersion() { return currentVersion; }
  public void setCurrentVersion(String currentVersion) { this.currentVersion = currentVersion; }
  public String getLtsVersion() { return ltsVersion; }
  public void setLtsVersion(String ltsVersion) { this.ltsVersion = ltsVersion; }
}
