package com.angrysurfer.shrapnel.model.style;

import java.util.Arrays;
import java.util.stream.Collectors;

public enum StyleTypeEnum {

	FONT(1),
	MARGIN(2),
	PADDING(3),
	WIDTH(4),
	HEIGHT(5);

	private int code;

	StyleTypeEnum(int code) {
		this.code = code;
	}

	public static StyleTypeEnum from(String name) throws IllegalArgumentException {

		StyleTypeEnum result = Arrays.asList(StyleTypeEnum.values()).stream().filter(type -> type.name().equals(name)).findFirst()
				.orElseThrow(() -> new IllegalArgumentException(
						"\nUnknown name '" + name + "', Allowed names are "
								+ String.join(", ", Arrays.asList(StyleTypeEnum.values()).stream().map((StyleTypeEnum type) -> {
							return String.join(name, "'", "'");
						}).collect(Collectors.toList()))));

		return result;
	}

	public static StyleTypeEnum from(int code) throws IllegalArgumentException {

		StyleTypeEnum result = Arrays.asList(StyleTypeEnum.values()).stream().filter(type -> type.getCode() == code).findFirst()
				.orElseThrow(() -> new IllegalArgumentException(
						"\nUnknown name '" + code + "', Allowed codes are "
								+ String.join(", ", Arrays.asList(StyleTypeEnum.values()).stream().map((StyleTypeEnum type) -> {
							return String.join(Integer.toString(code), "'", "'");
						}).collect(Collectors.toList()))));

		return result;
	}

	public int getCode() {
		return code;
	}
}
