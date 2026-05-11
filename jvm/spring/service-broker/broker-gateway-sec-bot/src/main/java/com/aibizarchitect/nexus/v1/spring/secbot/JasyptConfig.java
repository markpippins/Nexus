package com.aibizarchitect.nexus.v1.spring.secbot;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;

import org.jasypt.encryption.StringEncryptor;
import org.jasypt.encryption.pbe.PooledPBEStringEncryptor;
import org.jasypt.encryption.pbe.config.SimpleStringPBEConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Configuration
public class JasyptConfig {

	// TODO: replace with AES-256-GCM
	static String algorithm = "PBEWithMD5AndTripleDES";


	public static void main(String[] args) {
		PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
		SimpleStringPBEConfig    config    = new SimpleStringPBEConfig();
		config.setPassword("blackops");
		config.setAlgorithm(algorithm);
		config.setKeyObtentionIterations(1000);
		config.setPoolSize(1);
		encryptor.setConfig(config);

		Properties properties   = new Properties();
		File       file         = new File(".");
		String     path         = file.getAbsolutePath();
		String     propertyFile = path.substring(0, path.length() - 1) + "java/src/main/resources/application.properties";
		File       f            = new File(propertyFile);

		try (InputStream input = new FileInputStream(propertyFile)) {
			properties.load(input);
			properties.entrySet().stream()
					.filter(e -> e.getKey().toString().contains(".password") &&
							             e.getValue().toString().length() > 0 &&
							             !e.getKey().toString().contains("#") &&
							             !e.getValue().toString().contains("ENC("))
					.forEach(e -> {
						// log.info("{} = {}", e.getKey().toString(), e.getValue());
						properties.put(e.getKey(), encryptor.encrypt(e.getValue().toString()));
					});
//			.sorted((a, b) -> a.getKey().toString().compareTo(b.getKey().toString()))
		}
		catch (Exception e) {
			// log.error(e.getMessage(), e);
			throw new RuntimeException(e.getMessage(), e);
		}

		try {
			OutputStream output = new FileOutputStream(f);
			properties.store(output, "Properties");
			output.close();
		}
		catch (Exception e) {
			e.printStackTrace();
		}
	}

	@Primary
	@Bean("jasyptStringEncryptor")
	public StringEncryptor stringEncryptor() {
		PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
		SimpleStringPBEConfig    config    = new SimpleStringPBEConfig();
		config.setPassword(System.getProperty("jasypt.encryptor.password"));
		config.setAlgorithm(algorithm);
		config.setKeyObtentionIterations(1000);
		config.setPoolSize(1);
//		config.setProviderName(“SunJCE”);
//		config.setSaltGeneratorClassName(“org.jasypt.salt.RandomSaltGenerator”);
//		config.setIvGeneratorClassName(“org.jasypt.iv.RandomIvGenerator”);
//		config.setStringOutputType(“base64”);
		encryptor.setConfig(config);
		return encryptor;
	}
}
