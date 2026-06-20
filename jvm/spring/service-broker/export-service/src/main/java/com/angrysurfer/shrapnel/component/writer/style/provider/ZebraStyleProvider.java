package com.angrysurfer.shrapnel.component.writer.style.provider;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.component.writer.style.adapter.StyleAdapter;
import com.itextpdf.kernel.colors.Color;
import lombok.Getter;
import lombok.Setter;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;

@Getter
@Setter
public class ZebraStyleProvider extends CombinedStyleProvider {

    private IndexedColors excelBackgroundColor = IndexedColors.GREY_40_PERCENT;
    private IndexedColors excelForegroundColor = IndexedColors.WHITE;

    private CombinedStyleProvider darkStyleProvider;

    {
        darkStyleProvider = new CombinedStyleProvider() {
            @Override
            public void onWorkbookSet(Workbook workbook) {
                getCellStyle(workbook).setFillForegroundColor(getExcelBackgroundColor().getIndex());
                getCellStyle(workbook).setFillPattern(FillPatternType.SOLID_FOREGROUND);
            }
        };
    }

//    public ZebraStyleProvider() {
//        getDarkStyleProvider().getDefaultCellStyleAdapter().setBackgroundColor(Color.LIGHT_GRAY);
//    }
//
//    public ZebraStyleProvider(Color backgroundColor) {
//        getDarkStyleProvider().getDefaultCellStyleAdapter().setBackgroundColor(backgroundColor);
//    }

    public ZebraStyleProvider(IndexedColors excelBackgroundColor) {
        setExcelBackgroundColor(excelBackgroundColor);
    }

    public ZebraStyleProvider(Color backgroundColor, IndexedColors excelBackgroundColor) {
        getDarkStyleProvider().getDefaultCellStyleAdapter().setBackgroundColor(backgroundColor);
        setExcelBackgroundColor(excelBackgroundColor);
    }

    @Override
    public StyleAdapter getCellStyle(Object item, IField field, int row) {
        return row % 2 == 1 ? getDarkStyleProvider().getCellStyle(item, field, row) :
                super.getCellStyle(item, field, row);
    }

    @Override
    public XSSFCellStyle getCellStyle(Object item, Workbook workbook, IField field, int row) {
        return row % 2 == 0 ? getDarkStyleProvider().getCellStyle(item, workbook, field, row) :
                super.getCellStyle(item, workbook, field, row);
    }

    @Override
    public void onWorkbookSet(Workbook workbook) {
        super.onWorkbookSet(workbook);
        getDarkStyleProvider().onWorkbookSet(workbook);
    }
}
