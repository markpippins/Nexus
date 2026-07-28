package com.aibizarchitect.nexus.v1.spring.fs.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("File Service API DTOs")
class FsDtoTests {

    @Nested
    @DisplayName("FsItem")
    class FsItemTests {

        @Test
        @DisplayName("constructor and getters/setters via @Data")
        void setAndGet() {
            FsItem item = new FsItem();
            item.setName("file.txt");
            item.setType("file");
            item.setSize(1024);
            item.setUrl("/download/file.txt");

            assertEquals("file.txt", item.getName());
            assertEquals("file", item.getType());
            assertEquals(1024, item.getSize());
            assertEquals("/download/file.txt", item.getUrl());
        }

        @Test
        @DisplayName("default values are null/0")
        void defaults() {
            FsItem item = new FsItem();

            assertNull(item.getName());
            assertEquals(0L, item.getSize());
        }

        @Test
        @DisplayName("toString includes field values")
        void toStringIncludesFields() {
            FsItem item = new FsItem();
            item.setName("test.txt");

            assertTrue(item.toString().contains("test.txt"));
        }
    }

    @Nested
    @DisplayName("Mount")
    class MountTests {

        @Test
        @DisplayName("constructor and getters/setters via @Data")
        void setAndGet() {
            Mount mount = new Mount();
            mount.setId("mnt-1");
            mount.setName("home");
            mount.setType("local");
            mount.setDefaultMount(true);
            mount.setRootPath(List.of("/", "home"));

            assertEquals("mnt-1", mount.getId());
            assertEquals("home", mount.getName());
            assertTrue(mount.isDefaultMount());
            assertEquals(2, mount.getRootPath().size());
        }

        @Test
        @DisplayName("defaultMount defaults to false")
        void defaultMountFalse() {
            Mount mount = new Mount();

            assertFalse(mount.isDefaultMount());
        }
    }

    @Nested
    @DisplayName("FsRequest")
    class FsRequestTests {

        @Test
        @DisplayName("set and get path")
        void pathAccessor() {
            FsRequest req = new FsRequest();
            req.setPath(List.of("docs", "readme.md"));

            assertEquals(2, req.getPath().size());
            assertEquals("docs", req.getPath().get(0));
        }
    }

    @Nested
    @DisplayName("FsListResponse")
    class FsListResponseTests {

        @Test
        @DisplayName("set and get items")
        void itemsAccessor() {
            FsListResponse resp = new FsListResponse();
            FsItem item = new FsItem();
            item.setName("a.txt");
            resp.setItems(List.of(item));

            assertEquals(1, resp.getItems().size());
            assertEquals("a.txt", resp.getItems().get(0).getName());
        }
    }
}
