package com.angrysurfer.shrapnel.component.writer.style.provider;

import com.angrysurfer.shrapnel.field.IField;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;

public interface IExcelStyleProvider {

    XSSFCellStyle getCellStyle(Object item, Workbook workbook, IField field, int row);

    default XSSFCellStyle getCellStyle(Workbook workbook, IField field) {
        return getCellStyle(null, workbook, field, 0);
    }

    default XSSFCellStyle getCellStyle(Workbook workbook) {
        return getCellStyle(workbook, null);
    }

    XSSFCellStyle getHeaderStyle(Workbook workbook, IField field);

    default XSSFCellStyle getHeaderStyle(Workbook workbook) {
        return getHeaderStyle(workbook);
    }

    default void onWorkbookSet(Workbook workbook) {
    }

    default void onSheetSet(Sheet sheet) {
    }
}
