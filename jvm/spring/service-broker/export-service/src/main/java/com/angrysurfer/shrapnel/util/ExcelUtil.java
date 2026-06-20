package com.angrysurfer.shrapnel.util;

import com.angrysurfer.shrapnel.IExport;
import com.angrysurfer.shrapnel.component.writer.ExcelDataWriter;
import com.angrysurfer.shrapnel.exception.ShrapnelException;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

public class ExcelUtil {

	static final String XLSX = "xlsx";

	static Sheet createSheet(Workbook workbook, ExcelDataWriter writer, String label) {
		Sheet sheet = workbook.createSheet(label);
		for (int i = 0; i < writer.getFields().size(); i++)
			sheet.setColumnWidth(i, 6000);
		return sheet;
	}

	public static void addSpreadSheet(Workbook workbook, String label, Collection< Object > items, ExcelDataWriter writer) {
		Sheet sheet = createSheet(workbook, writer, label);

		Map< String, Object > config = new HashMap<>();
		config.put(ExcelDataWriter.WORKBOOK, workbook);
		config.put(ExcelDataWriter.SHEET, sheet);

		writer.writeData(config, items);
	}

	public static void addSpreadSheet(Workbook workbook, IExport export, Collection< Object > items) {
		addSpreadSheet(workbook, FileUtil.getLabel(export), items, export.getExcelRowWriter());
	}

	public static ByteArrayOutputStream generateByteArrayOutputStream(Collection< Object > data, IExport export) {
		Workbook workbook = new XSSFWorkbook();
		addSpreadSheet(workbook, export, data);
		return generateByteArrayOutputStream(workbook);
	}

	private static ByteArrayOutputStream generateByteArrayOutputStream(Workbook workbook) {
		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		try {
			workbook.write(baos);
			workbook.close();
		} catch (IOException e) {
			throw new ShrapnelException(e.getMessage(), e);
		}
		return baos;
	}

	public static String writeWorkbookToFile(Workbook workbook, String filename) {
		String outputFileName = FileUtil.getOutputFileName(filename, XLSX);
		FileUtil.ensureSafety(outputFileName);

		try (FileOutputStream fos = new FileOutputStream(outputFileName)) {
			workbook.write(fos);
			workbook.close();
		} catch (FileNotFoundException e) {
			throw new ShrapnelException(e.getMessage(), e);
		} catch (IOException e) {
			throw new ShrapnelException(e.getMessage(), e);
		}

		return outputFileName;
	}

	public static String writeWorkbookToFile(Collection< Object > data, IExport export, String filename) {
		Workbook workbook = new XSSFWorkbook();
		addSpreadSheet(workbook, export, data);
		return writeWorkbookToFile(workbook, filename);
	}
}
