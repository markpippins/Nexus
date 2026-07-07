package com.aibizarchitect.nexus.shrapnel.filter;

import com.aibizarchitect.nexus.shrapnel.writer.IDataWriter;
import com.aibizarchitect.nexus.shrapnel.property.IPropertyAccessor;

public interface IDataFilter {
    boolean allows(Object item, IDataWriter writer, IPropertyAccessor accessor);
}
