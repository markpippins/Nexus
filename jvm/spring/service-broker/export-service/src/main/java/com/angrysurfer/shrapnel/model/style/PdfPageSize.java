package com.angrysurfer.shrapnel.model.style;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.*;

@Getter
@Setter
@Entity
@Table(name = "page_size", schema = "shrapnel")
public class PdfPageSize {

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@Column(name = "id", nullable = false)
	private Integer id;

	@Column(name = "name", nullable = false)
	private String name;

	@Column(name = "width", nullable = false)
	private Float width;

	@Column(name = "height", nullable = false)
	private Float height;

	public PdfPageSize() {

	}

	public PdfPageSize(String name, float width, float height) {
		setName(name);
		setWidth(width);
		setHeight(height);
	}
}
