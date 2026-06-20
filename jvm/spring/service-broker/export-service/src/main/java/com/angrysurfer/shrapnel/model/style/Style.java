package com.angrysurfer.shrapnel.model.style;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import jakarta.persistence.*;
import java.util.Objects;

@Slf4j
@Getter
@Setter
@Entity
@Table(name = "style", schema = "shrapnel")
public class Style {

	@ManyToOne
	@JoinColumn(name = "style_type_code")
	public StyleType styleType;

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@Column(name = "id", nullable = false)
	private Long id;

	@Column(name = "name", nullable = false)
	private String name;

	@Column(name = "value", nullable = false)
	private String value;

	public StyleTypeEnum getType() {
		return Objects.isNull(this.styleType) ? null : StyleTypeEnum.from(this.styleType.getCode());
	}
}
