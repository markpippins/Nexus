package com.angrysurfer.shrapnel.filter;

import com.angrysurfer.shrapnel.writer.IDataWriter;
import com.angrysurfer.shrapnel.property.IPropertyAccessor;

public interface IDataFilter {
    boolean allows(Object item, IDataWriter writer, IPropertyAccessor accessor);
}
