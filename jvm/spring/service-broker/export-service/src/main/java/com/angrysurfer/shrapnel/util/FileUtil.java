package com.angrysurfer.shrapnel.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Map;
import java.util.Properties;

import org.springframework.core.io.ByteArrayResource;

import com.angrysurfer.shrapnel.IExport;
import com.angrysurfer.shrapnel.PropertyConfig;
import com.angrysurfer.shrapnel.component.writer.CsvDataWriter;
import com.angrysurfer.shrapnel.exception.ShrapnelException;
import com.angrysurfer.shrapnel.factory.IExportFactory;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class FileUtil {

	public static final String FILENAME = "filename";

	public static boolean ensureSafety(String filename) {
		boolean safe = true;

		File file = new File(filename);
		if (!file.getParentFile().exists())
			safe = file.getParentFile().mkdirs();

		Exception thrown = null;
		if (safe && file.exists())
			try {
				safe = file.delete();
			} catch (Exception e) {
				thrown = e;
				log.error(e.getMessage(), e);
				safe = false;
			}

		if (!safe)
			throw new ShrapnelException(String.format("%s is in use by another process of there is a permissions error.", filename), thrown);

		return safe;
	}

	public static ByteArrayResource getByteArrayResource(String filename) {
		ByteArrayResource result = null;
		File file = new File(filename);
		Path path = Paths.get(file.getAbsolutePath());
		try {
			result = new ByteArrayResource(Files.readAllBytes(path));
		} catch (IOException e) {
			log.error(e.getMessage(), e);
			throw new ShrapnelException(e.getMessage(), e);
		}
		return result;
	}

	public static String getFileName(IExportFactory factory) {
		return String.join("-", factory.getExportName(),
				Integer.toString(LocalDateTime.now().getHour()),
				Integer.toString(LocalDateTime.now().getMinute()),
				Integer.toString(LocalDateTime.now().getSecond()));
	}

	public static String getLabel(IExport export) {
		return String.join("-", export.getName(),
				Integer.toString(LocalDate.now().getDayOfMonth()),
				Integer.toString(LocalDate.now().getMonthValue()),
				Integer.toString(LocalDate.now().getYear()),
				Integer.toString(LocalDateTime.now().getHour()),
				Integer.toString(LocalDateTime.now().getMinute()),
				Integer.toString(LocalDateTime.now().getSecond()));
	}

	public static void removeFileAfter(String filename, long waitSeconds) {
		new Thread(new Runnable() {

			@Override
			public void run() {
				try {
					log.info("Standing by to delete {}.", filename);
					Thread.sleep(1000 * waitSeconds);
				} catch (InterruptedException e) {
					log.error(e.getMessage(), e);
				} finally {
					log.info("Deleting {}...", filename);
					File file = new File(filename);
					try {
						file.delete();
					} catch (Exception e) {
						log.error(e.getMessage(), e);
					}
				}
			}
		}).start();
	}

	public static String getOutputFileName(String filename, String ext) {

		File file = new File(".");
		String path = file.getAbsolutePath();
		String tail = ".".concat(ext);
		String outputFileName = path.substring(0, path.length() - 1) + "exports" + FileSystems.getDefault().getSeparator() + filename;
		if (!outputFileName.endsWith(tail))
			outputFileName = outputFileName + tail;

		return outputFileName;
	}

	public static Map< Object, Object > getFileProperties(String propertyFile) {
		Properties properties = new Properties();
		try (InputStream input = new FileInputStream(propertyFile)) {
			properties.load(input);
		} catch (Exception e) {
			log.error(e.getMessage(), e);
			throw new ShrapnelException(e.getMessage(), e);
		}
		return properties;
	}

	public static String getSQL(String filename) {
		try {
			return Files.readString(Path.of(PropertyConfig.getInstance().getProperty(PropertyConfig.SQL_FOLDER) + filename + ".sql"));
		} catch (IOException e) {
			log.error(e.getMessage(), e);
			throw new ShrapnelException(e.getMessage(), e);
		}
	}

	public static void writeCsvFile(Collection data, IExport export, String filename) {
		CsvDataWriter writer = new CsvDataWriter(export.getFields());
		writer.writeValues(data, filename);
	}
}

