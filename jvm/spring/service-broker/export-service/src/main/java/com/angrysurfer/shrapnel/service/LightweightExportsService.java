package com.angrysurfer.shrapnel.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import com.angrysurfer.shrapnel.component.writer.CsvDataWriter;
import com.angrysurfer.shrapnel.component.writer.ExcelDataWriter;
import com.angrysurfer.shrapnel.component.writer.PdfDataWriter;
import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.util.ExcelUtil;
import com.angrysurfer.shrapnel.util.FileUtil;
import com.angrysurfer.shrapnel.util.PdfUtil;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LightweightExportsService implements ILightweightExportsService {

	@Override
	public String writeCSVFile(Collection< Object > items, List< IField > fields, String filename) {
		FileUtil.ensureSafety(filename);
		CsvDataWriter writer = new CsvDataWriter(fields);
		writer.writeValues(items, filename);
		return filename;
	}

	@Override
	public String writeExcelFile(Collection< Object > items, List< IField > fields, String sheetName, String filename) {
		LocalDateTime now = LocalDateTime.now();
		String name = String.format("%s - %s - %s - %s", sheetName, LocalDate.now().getDayOfMonth(), LocalDate.now().getMonthValue(), LocalDate.now().getYear());
		Workbook workbook = new XSSFWorkbook();
		ExcelUtil.addSpreadSheet(workbook, name, items, new ExcelDataWriter(fields));
		ExcelUtil.writeWorkbookToFile(workbook, filename);
		return filename;
	}

	@Override
	public String writeExcelFile(Collection< Object > items, ExcelDataWriter writer, String sheetName, String filename) {
		LocalDateTime now = LocalDateTime.now();
		String name = String.format("%s - %s - %s - %s", sheetName, now.getDayOfMonth(), now.getMonthValue(), now.getYear());
		Workbook workbook = new XSSFWorkbook();
		ExcelUtil.addSpreadSheet(workbook, name, items, writer);
		ExcelUtil.writeWorkbookToFile(workbook, filename);
		return filename;
	}

	@Override
	public String writeTabularPdfFile(Collection< Object > items, List< IField > fields, String filename) {
		PdfUtil.writeTabularFile(items, new PdfDataWriter(fields), filename);
		return filename;
	}

	@Override
	public String writeTabularPdfFile(Collection< Object > items, PdfDataWriter pdfRowWriter, String filename) {
		PdfUtil.writeTabularFile(items, pdfRowWriter, filename);
		return filename;
	}
}
