package com.angrysurfer.shrapnel;

import java.util.Map;

import com.angrysurfer.shrapnel.component.writer.ExcelDataWriter;
import com.angrysurfer.shrapnel.component.writer.PdfDataWriter;
import com.aibizarchitect.nexus.shrapnel.field.IFields;
import com.aibizarchitect.nexus.shrapnel.filter.IDataFilter;
import com.itextpdf.kernel.geom.PageSize;

public interface IExport {

    void addFilter(Map<String, Object> filterCriteria);

    void addFilter(IDataFilter filter);

    IFields getFields();

    String getName();

    ExcelDataWriter getExcelRowWriter();

    PdfDataWriter getPdfRowWriter();

    PageSize getPdfPageSize();

    void init();
}
