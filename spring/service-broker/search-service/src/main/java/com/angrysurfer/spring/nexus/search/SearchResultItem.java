package com.angrysurfer.spring.nexus.search;

import lombok.Data;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
public class SearchResultItem {
    private String kind;
    private String title;
    private String htmlTitle;
    private String link;
    private String displayLink;
    private String snippet;
    private String htmlSnippet;
    private String formattedUrl;
    private String htmlFormattedUrl;
    private Map<String, Object> pagemap;
    private List<Map<String, String>> metatags;
    private List<Map<String, String>> cseThumbnail;
    private List<Map<String, String>> cseImage;
    private Instant timestamp;
    
    // YouTube-specific fields
    private String videoId;
    private String channelTitle;
    private String publishDate;
    private String thumbnailUrl;
    private String mediumThumbnailUrl;
    private String highThumbnailUrl;
    private String duration;
    private Integer viewCount;
    private String channelId;
    private String publishedAt; // Additional YouTube field
    private String channelUrl; // Additional field for YouTube channels
    
    // Unsplash-specific fields
    private String regularImageUrl;
    private String smallImageUrl;
    private String thumbImageUrl;
    private String fullImageUrl;
    private String photographerName;
    private String photographerUsername;
    private String photographerPortfolioUrl;
    private Integer downloadCount;
    private Integer width;
    private Integer height;
    private String createdAt;
    private String updatedAt;
    private List<String> tags;
    private String description;
    
    // Gemini-specific fields
    private String prompt;
    private String generatedText;
    private List<Map<String, Object>> promptFeedback;
    private Double safetyRating;
    private String modelUsed;
    private String generationConfig;
    private Integer maxOutputTokens;
    private Double temperature;
    private String mimeType; // For multimodal content
}