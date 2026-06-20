package com.angrysurfer.shrapnel;

import com.angrysurfer.shrapnel.field.Fields;
import com.angrysurfer.shrapnel.field.IFields;

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
