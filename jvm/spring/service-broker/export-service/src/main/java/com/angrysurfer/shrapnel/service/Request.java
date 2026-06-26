package com.angrysurfer.shrapnel.service;

import java.util.HashMap;
import java.util.Map;

import com.angrysurfer.shrapnel.validation.IRequestValidation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Request {

    private Map<String, Object> filterCriteria = new HashMap<>();

    @NotBlank(groups = {IRequestValidation.RequestExport.class})
    private String name;

    @Size(min = 3, max = 4, groups = {IRequestValidation.RequestExport.class})
    @NotBlank(groups = {IRequestValidation.RequestExport.class})
    private String fileType;
}
