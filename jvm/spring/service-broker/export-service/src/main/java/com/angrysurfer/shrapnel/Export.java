package com.angrysurfer.shrapnel;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.field.IFields;
import com.angrysurfer.shrapnel.field.IValueCalculator;
import com.angrysurfer.shrapnel.field.IValueFormatter;
import com.angrysurfer.shrapnel.filter.IDataFilter;
import com.angrysurfer.shrapnel.filter.StringFieldFilter;
import com.angrysurfer.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.component.writer.ExcelDataWriter;
import com.angrysurfer.shrapnel.component.writer.PdfDataWriter;
import com.angrysurfer.shrapnel.component.writer.style.provider.CombinedStyleProvider;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Setter
public abstract class Export extends AbstractExport {

    private ExcelDataWriter excelRowWriter;

    private PdfDataWriter pdfRowWriter;

    public Export(String name, List<IField> fields) {
        setName(name);
        fields.forEach(field -> getFields().add(field));
    }

    public Export(String name, List<IField> fields, IPropertyAccessor propertyAccessor) {
        this(name, fields);
        fields.forEach(field -> getFields().add(field));
    }

    public Export(String name, IFields fields) {
        setName(name);
        setFields(fields);
    }

    public Export(String name, IFields fields, IPropertyAccessor propertyAccessor) {
        this(name, fields);
        setPropertyAccessor(propertyAccessor);
    }

    @Override
    public void addFilter(Map<String, Object> filterCriteria) {
        getExcelRowWriter().getFilters().add(new StringFieldFilter(filterCriteria));
        getPdfRowWriter().getFilters().add(new StringFieldFilter(filterCriteria));
    }

    @Override
    public void addFilter(IDataFilter filter) {
        getExcelRowWriter().getFilters().add(filter);
        getPdfRowWriter().getFilters().add(filter);
    }

    @Override
    public ExcelDataWriter getExcelRowWriter() {
        if (Objects.isNull(excelRowWriter))
            excelRowWriter = new ExcelDataWriter(getFields());

        return excelRowWriter;
    }

    @Override
    public PdfDataWriter getPdfRowWriter() {
        if (Objects.isNull(pdfRowWriter))
            pdfRowWriter = new PdfDataWriter(getFields());

        return pdfRowWriter;
    }

    public void setPropertyAccessor(IPropertyAccessor propertyAccessor) {
        getExcelRowWriter().setPropertyAccessor(propertyAccessor);
        getPdfRowWriter().setPropertyAccessor(propertyAccessor);
    }

    public void setStyleProvider(CombinedStyleProvider styleProvider) {
        getExcelRowWriter().setStyleProvider(styleProvider);
        getPdfRowWriter().setStyleProvider(styleProvider);
    }

    public void setValueCalculator(IValueCalculator valueCalculator) {
        getExcelRowWriter().setValueCalculator(valueCalculator);
        getPdfRowWriter().setValueCalculator(valueCalculator);
    }

    public void setValueRenderer(IValueFormatter valueRenderer) {
        getExcelRowWriter().setValueRenderer(valueRenderer);
        getPdfRowWriter().setValueRenderer(valueRenderer);
    }
}
