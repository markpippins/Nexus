package com.angrysurfer.shrapnel.component.writer.style.provider;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.component.writer.style.adapter.StyleAdapter;
import com.itextpdf.layout.Style;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.awt.*;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

@Slf4j
public class CombinedStyleProvider extends StyleProvider implements IExcelStyleProvider {

    private static final String DEFAULT_FONT = "Courier";

    protected Map<Style, XSSFCellStyle> styleXSSFCellStyleMap = new HashMap<>();

    private boolean cellDefaultsAccessed = false;
    private boolean headerDefaultsAccessed = false;

    protected void apply(Workbook workbook, StyleAdapter adapter, CellStyle style) {
        log.info("in apply.");
    }

    private XSSFCellStyle createCellStyle(Workbook workbook) {
        return (XSSFCellStyle) workbook.createCellStyle();
    }

    private XSSFCellStyle createHeaderStyle(Workbook workbook) {
        return (XSSFCellStyle) workbook.createCellStyle();
    }

    @Override
    public XSSFCellStyle getCellStyle(Object item, Workbook workbook, IField field, int row) {
        if (Objects.isNull(workbook))
            throw new NullPointerException("CellStyle instance cannot be accessed without a Workbook");

        StyleAdapter adapter = getCellStyle(item, field, row);
        if (!styleXSSFCellStyleMap.containsKey(adapter)) {
            XSSFCellStyle cellStyle = createCellStyle(workbook);
            apply(workbook, adapter, cellStyle);
            setXSSFCellDefaults(workbook, cellStyle);

            if (Objects.nonNull(field) && cellDefaultsAccessed) {
                XSSFCellStyle defaultCellStyle = getCellStyle(workbook);
                cellStyle.cloneStyleFrom(defaultCellStyle);
            }

            styleXSSFCellStyleMap.put(adapter, cellStyle);
        }

        if (Objects.isNull(field))
            cellDefaultsAccessed = true;

        return styleXSSFCellStyleMap.get(adapter);
    }

    @Override
    public XSSFCellStyle getHeaderStyle(Workbook workbook, IField field) {
        if (Objects.isNull(workbook))
            throw new NullPointerException("CellStyle instance cannot be accessed without a Workbook");

        StyleAdapter adapter = getHeaderStyle(field);
        if (!styleXSSFCellStyleMap.containsKey(adapter)) {
            XSSFCellStyle headerStyle = createHeaderStyle(workbook);
            apply(workbook, adapter, headerStyle);
            setXSSFHeaderDefaults(workbook, headerStyle);

            if (Objects.nonNull(field) && headerDefaultsAccessed) {
                XSSFCellStyle defaultHeaderStyle = getHeaderStyle(workbook);
                headerStyle.cloneStyleFrom(defaultHeaderStyle);
            }

            styleXSSFCellStyleMap.put(adapter, headerStyle);
        }

        if (Objects.isNull(field))
            headerDefaultsAccessed = true;

        return styleXSSFCellStyleMap.get(adapter);
    }

    private void setXSSFCellDefaults(Workbook workbook, XSSFCellStyle cellStyle) {
        XSSFFont xssfFont = ((XSSFWorkbook) workbook).createFont();
        xssfFont.setFontName("Courier");
        xssfFont.setFontHeight(11);
        xssfFont.setColor(IndexedColors.BLACK.getIndex());
        xssfFont.setBold(false);

        cellStyle.setFont(xssfFont);
    }

    private void setXSSFHeaderDefaults(Workbook workbook, XSSFCellStyle cellStyle) {
        XSSFFont xssfFont = ((XSSFWorkbook) workbook).createFont();
        xssfFont.setFontName("Courier");
        xssfFont.setFontHeight(10.5);
        xssfFont.setColor(IndexedColors.WHITE.getIndex());
        xssfFont.setBold(true);
        cellStyle.setFont(xssfFont);

        XSSFColor color = new XSSFColor(new byte[]{(byte) 44, (byte) 89, (byte) 148}, null);
        cellStyle.setFillForegroundColor(color);
        cellStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
    }
}
