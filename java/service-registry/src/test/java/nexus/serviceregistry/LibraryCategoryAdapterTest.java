package nexus.serviceregistry;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import nexus.serviceregistry.v1.entity.LibraryCategory as LegacyLibraryCategory;

public class LibraryCategoryAdapterTest {
  @Test
  public void testRoundTrip() {
    LegacyLibraryCategory legacy = new LegacyLibraryCategory(7L, "Core Librarian");
    LibraryCategory core = LibraryCategoryAdapter.toCanonical(legacy);
    assertNotNull(core);
    assertEquals(Long.valueOf(7), core.getId());
    assertEquals("Core Librarian", core.getName());

    LegacyLibraryCategory back = LibraryCategoryAdapter.fromCanonical(core);
    assertNotNull(back);
    assertEquals(legacy.getId(), back.getId());
  }
}
