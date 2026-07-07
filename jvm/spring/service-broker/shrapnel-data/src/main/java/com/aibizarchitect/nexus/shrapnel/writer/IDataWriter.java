package com.aibizarchitect.nexus.shrapnel.writer;


import java.util.Collection;
import java.util.List;
import java.util.Map;

import com.aibizarchitect.nexus.shrapnel.field.IField;
import com.aibizarchitect.nexus.shrapnel.field.IValueCalculator;

public interface IDataWriter {

    IValueCalculator getValueCalculator();

    List< IField > getFields();

    default IField getField(String propertyName) {
        return getFields().stream()
                .filter(field -> field.getPropertyName().equalsIgnoreCase(propertyName))
                .findFirst().orElse(null);
    }

    default int getFieldCount() {
        return getFields().size();
    }

    void writeData(Map<String, Object> outputConfig, Collection<Object> items);

    void writeError(Exception e);
}
