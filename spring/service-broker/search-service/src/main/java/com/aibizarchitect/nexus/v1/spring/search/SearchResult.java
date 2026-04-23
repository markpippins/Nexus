package com.aibizarchitect.nexus.v1.spring.search;

import lombok.Data;
import java.util.List;

@Data
public class SearchResult {
    private List<SearchResultItem> items;
    private Object rawResponse;
}