package com.angrysurfer.shrapnel.component.writer;

import java.io.FileWriter;
import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.filter.DataFilters;
import com.angrysurfer.shrapnel.filter.IDataFilters;
import com.angrysurfer.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.property.PropertyUtilsPropertyAccessor;
import com.angrysurfer.shrapnel.writer.IDataWriter;
import com.angrysurfer.shrapnel.exception.ShrapnelException;
import com.angrysurfer.shrapnel.util.FileUtil;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Getter
@Setter
@Slf4j
public class CsvDataWriter extends DataWriter implements IDataWriter {

    private static final String SPACE = " ";

    private boolean spaceAfterDelim = true;

    private String delimiter = ",";

    private IPropertyAccessor propertyAccessor = new PropertyUtilsPropertyAccessor();

    private List< IField > columns;

    private IDataFilters filters = new DataFilters();

    public CsvDataWriter(List<IField> columns) {
        super(columns);
    }

    public CsvDataWriter(List<IField> columns, String delimiter) {
        super(columns);
        setDelimiter(delimiter);
    }

    @Override
    public void writeData(Map<String, Object> outputConfig, Collection<Object> items) {
        String filename = outputConfig.get(FileUtil.FILENAME).toString();
        writeValues(items, filename);
    }

    @Override
    public void writeError(Exception e) {

    }

    public void writeValues(Collection<Object> items, String filename) {
        try {
            FileWriter fileWriter = new FileWriter(filename);
            items.stream().filter(item -> filters.allow(item, this, this.getPropertyAccessor())).forEach(item -> {
                StringBuffer line = new StringBuffer();
                getFields().forEach(col -> {
                    line.append(getValue(item, col));
                    if (getFields().indexOf(col) < getFields().size() - 1)
                        line.append(spaceAfterDelim ? getDelimiter() + SPACE : getDelimiter());
                });
                try {
                    fileWriter.write(line.toString().concat("\n"));
                } catch (IOException e) {
throw new ShrapnelException(e.getMessage(), e);
                }
            });
            fileWriter.flush();
            fileWriter.close();
        } catch (IOException e) {
            throw new ShrapnelException(e.getMessage(), e);
        }
    }
}
