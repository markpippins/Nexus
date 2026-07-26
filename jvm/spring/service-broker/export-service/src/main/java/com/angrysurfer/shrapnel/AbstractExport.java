package com.angrysurfer.shrapnel;

import com.aibizarchitect.nexus.shrapnel.field.Fields;
import com.aibizarchitect.nexus.shrapnel.field.IFields;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Setter
public abstract class AbstractExport implements IExport {

    private String name;

    private IFields fields = new Fields();
}
