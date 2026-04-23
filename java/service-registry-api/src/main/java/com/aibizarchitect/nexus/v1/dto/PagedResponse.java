package com.aibizarchitect.nexus.v1.dto;

import java.util.List;

/**
 * Generic paged response wrapper for API responses.
 * Framework-neutral DTO shared across Spring, Helidon, and Quarkus.
 */
public class PagedResponse<T> {
    private List<T> data;
    private Meta meta;

    public PagedResponse() {
    }

    public PagedResponse(List<T> data, Meta meta) {
        this.data = data;
        this.meta = meta;
    }

    public PagedResponse(List<T> data, int page, int perPage, long total, int lastPage, String nextPageUrl) {
        this.data = data;
        this.meta = new Meta(page, perPage, total, lastPage, nextPageUrl);
    }

    public List<T> getData() {
        return data;
    }

    public void setData(List<T> data) {
        this.data = data;
    }

    public Meta getMeta() {
        return meta;
    }

    public void setMeta(Meta meta) {
        this.meta = meta;
    }

    /**
     * Metadata for paged responses.
     */
    public static class Meta {
        private int page;
        private int per_page;
        private long total;
        private int last_page;
        private String next_page_url;

        public Meta() {
        }

        public Meta(int page, int perPage, long total, int lastPage, String nextPageUrl) {
            this.page = page;
            this.per_page = perPage;
            this.total = total;
            this.last_page = lastPage;
            this.next_page_url = nextPageUrl;
        }

        public int getPage() {
            return page;
        }

        public void setPage(int page) {
            this.page = page;
        }

        public int getPer_page() {
            return per_page;
        }

        public void setPer_page(int per_page) {
            this.per_page = per_page;
        }

        public long getTotal() {
            return total;
        }

        public void setTotal(long total) {
            this.total = total;
        }

        public int getLast_page() {
            return last_page;
        }

        public void setLast_page(int last_page) {
            this.last_page = last_page;
        }

        public String getNext_page_url() {
            return next_page_url;
        }

        public void setNext_page_url(String next_page_url) {
            this.next_page_url = next_page_url;
        }
    }
}
